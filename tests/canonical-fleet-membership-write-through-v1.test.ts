import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../migrations/20260912030000_add_canonical_fleet_membership_write_through_v1.sql', import.meta.url),
  'utf8',
);

function functionBody(name: string): string {
  const marker = new RegExp(`create or replace function public\\.${name}\\b`, 'i');
  const start = migration.search(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const rest = migration.slice(start);
  const next = rest.slice(1).search(/\ncreate or replace function public\./i);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test('Step 3 serializes T0, Nybil and AVVECKLA against one cutover lock', () => {
  assert.match(migration, /FLEET_MEMBERSHIP_V1:CUTOVER/);
  for (const name of [
    'apply_fleet_membership_bootstrap_batch',
    'sync_nybil_garage_handoff',
    'append_fleet_membership_entry_from_nybil',
    'complete_garage_avveckla_ut_internal',
    'append_fleet_membership_exit_from_avveckla',
  ]) {
    assert.match(functionBody(name), /perform public\.lock_fleet_membership_cutover\(\)/i, `${name} must take cutover lock`);
  }
});

test('Nybil ENTRY is exact-source and anchored to verified Garage IN handoff', () => {
  const body = functionBody('append_fleet_membership_entry_from_nybil');
  assert.match(body, /from public\.nybil_inventering/i);
  assert.match(body, /source_garage_item_id/i);
  assert.match(body, /garage_direction <> 'IN'/i);
  assert.match(body, /handed_off_nybil_id is distinct from v_nybil\.id/i);
  assert.match(body, /'NYBIL'[\s\S]*'nybil_inventering'[\s\S]*v_nybil\.id::text[\s\S]*v_nybil\.id::text/i);
  assert.match(body, /'ACTIVE'[\s\S]*'ENTRY'/i);
});

test('AVVECKLA EXIT accepts only the three locked terminal source event types', () => {
  const body = functionBody('append_fleet_membership_exit_from_avveckla');
  assert.match(body, /UT_OVERLAMNING_VERIFIERAD/);
  assert.match(body, /UT_TRANSPORTOR_HAMTAT_VERIFIERAD/);
  assert.match(body, /UT_AVSTALLNING_VERIFIERAD/);
  assert.match(body, /garage-avveckla:' \|\| v_event\.avveckla_case_id::text \|\| ':TERMINAL_UT'/i);
  assert.match(body, /'GARAGE_AVVECKLA'[\s\S]*'garage_avveckla_events'[\s\S]*v_event\.event_id::text/i);
});

test('pre-T0 initial EXIT is narrow and post-T0 NO_FACT EXIT is rejected', () => {
  const body = functionBody('append_fleet_membership_exit_from_avveckla');
  assert.match(body, /bootstrap_denominator_eligible/i);
  assert.match(body, /POST_T0_NO_FACT_EXIT_REJECT/);
  assert.match(body, /'INACTIVE'[\s\S]*'EXIT'[\s\S]*'GARAGE_AVVECKLA'[\s\S]*'garage_avveckla_events'/i);
  assert.match(body, /initial_exit_pre_t0', true/i);
  assert.doesNotMatch(body, /'ACTIVE'\s*,\s*'ENTRY'/i);
});

test('terminal AVVECKLA function appends EXIT before completing downstream work in one transaction', () => {
  const body = functionBody('complete_garage_avveckla_ut_internal');
  const eventInsert = body.indexOf('insert into public.garage_avveckla_events');
  const membership = body.indexOf('append_fleet_membership_exit_from_avveckla');
  const closePeriod = body.indexOf('close_vehicle_journey_period_from_source');
  const caseUpdate = body.indexOf('update public.garage_avveckla_cases');
  const garageUpdate = body.indexOf('update public.garage_items');
  assert.ok(eventInsert >= 0 && membership > eventInsert && closePeriod > membership && caseUpdate > closePeriod && garageUpdate > caseUpdate);
});

test('internal cutover/source adapters are not exposed to service_role', () => {
  for (const signature of [
    'lock_fleet_membership_cutover()',
    'resolve_fleet_identity_from_verified_source(text,text,timestamptz,text,text,text,text,jsonb)',
    'append_fleet_membership_entry_from_nybil(uuid)',
    'append_fleet_membership_exit_from_avveckla(uuid)',
  ]) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated, service_role`, 'i'));
  }
});

test('Step 3 contains no historical backfill or consumer cutover DML', () => {
  assert.doesNotMatch(migration, /insert\s+into\s+public\.fleet_membership_bootstrap_(batches|items|seals)/i);
  assert.doesNotMatch(migration, /update\s+public\.fleet_membership_bootstrap_(batches|items|seals)/i);
  assert.doesNotMatch(migration, /hjulskifte|tower/i);
});
