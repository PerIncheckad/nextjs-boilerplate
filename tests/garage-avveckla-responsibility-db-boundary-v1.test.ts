import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boundary = readFileSync('migrations/20260909044500_lock_garage_avveckla_responsibility_db_boundary_v1.sql', 'utf8');
const foundation = readFileSync('migrations/20260902230000_add_garage_avveckla_foundation_v1.sql', 'utf8');
const terminal = readFileSync('migrations/20260902233000_add_garage_avveckla_terminal_handoffs_v1.sql', 'utf8');
const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const voidApi = readFileSync('app/api/garage/void/route.ts', 'utf8');

test('A: new AVVECKLA responsibility requires exactly one locked open Layer-1 period', () => {
  assert.match(boundary, /create or replace function public\.start_garage_avveckla_case/i);
  assert.match(boundary, /vehicle_journey_periods/i);
  assert.match(boundary, /ended_at is null/i);
  assert.match(boundary, /for update/i);
  assert.match(boundary, /v_period_count = 0/i);
  assert.match(boundary, /v_period_count > 1/i);
  assert.match(boundary, /exakt en öppen Layer 1-period krävs/i);
});

test('A: exact start retry returns the established case and exact STARTED event before mutable-state gates', () => {
  const existingCaseLookup = boundary.indexOf('from public.garage_avveckla_cases');
  const voidGate = boundary.indexOf("if v_item.voided_at is not null");
  assert.ok(existingCaseLookup >= 0 && voidGate >= 0 && existingCaseLookup < voidGate);
  assert.match(boundary, /event_key = 'garage-avveckla:' \|\| v_case\.avveckla_case_id::text \|\| ':STARTED'/i);
  assert.match(boundary, /v_started_count <> 1/i);
  assert.match(boundary, /v_case\.reason is distinct from v_reason/i);
  assert.match(boundary, /v_case\.started_by is distinct from p_actor/i);
  assert.match(boundary, /'case', to_jsonb\(v_case\)[\s\S]*'event_id', v_event\.event_id/i);
  assert.match(boundary, /start-retry konflikterar med etablerat historiskt handslag/i);
});

test('B: any established AVVECKLA case freezes generic Garage mutation and void', () => {
  assert.match(boundary, /guard_garage_after_avveckla_start_v1/i);
  assert.match(boundary, /from public\.garage_avveckla_cases[\s\S]*where garage_item_id = old\.garage_item_id/i);
  assert.match(boundary, /Garage-objekt med etablerat AVVECKLA-case är överlämnat och fryst/i);
  assert.match(garageApi, /from\('garage_items'\)\.update/);
  assert.match(voidApi, /void_garage_item/);
});

test('B/C: direct Garage terminal fabrication is rejected unless exact canonical completion fact already exists', () => {
  assert.match(boundary, /Terminal Garage-historik kräver canonical AVVECKLA-case och completion-event/i);
  assert.match(boundary, /v_case\.status = 'COMPLETED'/i);
  assert.match(boundary, /v_case\.completion_event_id is not distinct from new\.completion_event_id/i);
  assert.match(boundary, /v_event\.event_type in/i);
  for (const type of ['UT_OVERLAMNING_VERIFIERAD', 'UT_TRANSPORTOR_HAMTAT_VERIFIERAD', 'UT_AVSTALLNING_VERIFIERAD']) {
    assert.match(boundary, new RegExp(type));
  }
});

test('C: AVVECKLA tables are runtime SELECT-only', () => {
  for (const table of ['garage_avveckla_cases', 'garage_avveckla_points', 'garage_avveckla_events']) {
    assert.match(boundary, new RegExp(`revoke all privileges on table public\\.${table}[\\s\\S]*service_role`, 'i'));
    assert.match(boundary, new RegExp(`grant select on table public\\.${table} to service_role`, 'i'));
  }
  assert.doesNotMatch(boundary, /grant\s+(?:insert|update|delete|truncate)[^;]*garage_avveckla_(?:cases|points|events)[^;]*service_role/i);
});

test('C: Layer-1 close under OPEN AVVECKLA requires exact terminal event and period identity', () => {
  assert.match(boundary, /guard_layer1_close_after_avveckla_start_v1/i);
  assert.match(boundary, /c\.status = 'OPEN'/i);
  assert.match(boundary, /e\.occurred_at is not distinct from new\.ended_at/i);
  assert.match(boundary, /e\.payload ->> 'journeyPeriodId' = old\.period_id::text/i);
  assert.match(boundary, /kan endast stängas av canonical terminal completion/i);
});

test('existing canonical AVVECKLA writers remain SECURITY DEFINER entrypoints', () => {
  for (const fn of ['add_garage_avveckla_point', 'close_garage_avveckla_point', 'assert_garage_avveckla_ready_for_completion']) {
    assert.match(foundation, new RegExp(`function public\\.${fn}`, 'i'));
  }
  assert.match(boundary, /grant execute on function public\.start_garage_avveckla_case[\s\S]*to service_role/i);
});

test('terminal readiness remains exclusively delegated to assert_garage_avveckla_ready_for_completion', () => {
  assert.match(terminal, /v_avveckla_case_id := public\.assert_garage_avveckla_ready_for_completion\(p_garage_item_id\)/i);
  assert.doesNotMatch(boundary, /select count\(\*\)[\s\S]*garage_avveckla_points[\s\S]*status = 'OPEN'/i);
});

test('boundary does not invent cancellation, backfill, SALU or LEGACY rewrites', () => {
  assert.doesNotMatch(boundary, /CANCELLED|ABANDONED|AVBRUTEN/i);
  assert.doesNotMatch(boundary, /historical_backfill\s*=\s*true/i);
  assert.doesNotMatch(boundary, /update\s+public\.salu_flags/i);
  assert.doesNotMatch(boundary, /update\s+public\.vehicle_legacy_current_state_entries/i);
  assert.doesNotMatch(boundary, /insert\s+into\s+public\.vehicle_journey_periods/i);
});
