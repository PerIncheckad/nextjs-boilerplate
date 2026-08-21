import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260821125500_add_vehicle_status_period_write_through.sql'),
  'utf8',
);

test('explicit rental-readiness status drives only AVAILABLE or DOWNTIME primary states', () => {
  assert.match(migration, /Ja\s*=> AVAILABLE/i);
  assert.match(migration, /Nej => DOWNTIME/i);
  assert.match(migration, /v_target_state := case when v_new_value = 'ja' then 'AVAILABLE' else 'DOWNTIME' end/i);
  assert.doesNotMatch(migration, /v_target_state[^;]*RENTAL/i);
});

test('ej uthyrningsbar requires the explicit same-batch reason before downtime is established', () => {
  assert.match(migration, /field_name = 'ej_uthyrningsbar_anledning'/i);
  assert.match(migration, /batch_id is not distinct from v_edit\.batch_id/i);
  assert.match(migration, /Ej uthyrningsbar requires an explicit reason before DOWNTIME can be established/i);
  assert.match(migration, /v_reason_code := case when v_target_state = 'DOWNTIME' then 'OTHER' else null end/i);
});

test('vehicle status period write-through remains fail-open and durable', () => {
  assert.match(migration, /create table public\.period_write_through_failures/i);
  assert.match(migration, /exception when others[\s\S]*period_write_through_failures/i);
  assert.match(migration, /Absolute fail-open boundary/i);
  assert.match(migration, /raise warning '\[period-write-through\] statement adapter failed:/i);
  assert.match(migration, /return null/i);
});

test('one source edit is idempotent and replayable without historical backfill', () => {
  assert.match(migration, /vehicle_journey_periods_vehicle_edit_source_uidx/i);
  assert.match(migration, /source_system = 'STATUS'/i);
  assert.match(migration, /source_entity = 'vehicle_edits'/i);
  assert.match(migration, /replay_vehicle_status_period_write_through/i);
  assert.match(migration, /only replays an edit id chosen by the server/i);
  assert.doesNotMatch(migration, /insert into public\.vehicle_journey_periods[\s\S]*select[\s\S]*from public\.vehicle_edits/i);
});

test('period transition preserves source identity and append-only journey semantics', () => {
  assert.match(migration, /transition_vehicle_journey_state/i);
  assert.match(migration, /'STATUS'/);
  assert.match(migration, /'vehicle_edits'/);
  assert.match(migration, /'sourceKind', 'RENTAL_READINESS'/i);
  assert.match(migration, /'sourceField', 'klar_for_uthyrning'/i);
});

test('write-through functions remain server controlled while trigger can invoke them', () => {
  for (const fn of [
    'try_write_through_vehicle_status_period',
    'write_through_vehicle_status_periods',
    'replay_vehicle_status_period_write_through',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*from public, anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to service_role`, 'i'));
  }
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog/i);
});
