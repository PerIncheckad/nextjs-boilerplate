import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260905113500_add_salu_saljas_to_avveckla_handoff_v1.sql'),
  'utf8',
);

test('SÄLJAS owns the only automatic SALU to AVVECKLA transition', () => {
  assert.match(migration, /new\.status = 'STÄNGD'/);
  assert.match(migration, /new\.closure_outcome = 'SÄLJAS'/);
  assert.match(migration, /materialize_salu_saljas_to_avveckla_v1/);
  assert.doesNotMatch(migration, /closure_outcome = 'PLANERA VERKSTAD'/);
  assert.doesNotMatch(migration, /closure_outcome = 'FÖRLÄNGA'/);
});

test('handoff is explicit, source-owned and traceable to the exact SALU cycle', () => {
  assert.match(migration, /'SALU_TO_AVVECKLA'/);
  assert.match(migration, /'BILKONTROLL'/);
  assert.match(migration, /'AVVECKLA'/);
  assert.match(migration, /public\.ensure_handoff_from_source/);
  assert.match(migration, /'SALU'/);
  assert.match(migration, /'salu_flags'/);
  assert.match(migration, /v_flag\.flag_id::text/);
  assert.match(migration, /'salu-manual-close:' \|\| v_flag\.flag_id::text/);
});

test('existing SALU Garage item is reused and forced to UT instead of duplicated', () => {
  assert.match(migration, /where source_kind = 'SALU'[\s\S]*source_salu_flag_id = v_flag\.flag_id/);
  assert.match(migration, /garage_direction = 'UT'/);
  assert.match(migration, /planning_reason = 'SALU'/);
  assert.match(migration, /source_salu_flag_id/);
});

test('new SÄLJAS Garage item does not invent station or operational state', () => {
  assert.match(migration, /planned_station,[\s\S]*null,/i);
  assert.match(migration, /'BEKRAFTAD'/);
  assert.match(migration, /'EJ_BOKAD'/);
  assert.doesNotMatch(migration, /vehicle_journey_periods/);
  assert.doesNotMatch(migration, /rental_operational_facts/);
});

test('AVVECKLA case starts from the existing canonical AVVECKLA entrypoint', () => {
  assert.match(migration, /public\.start_garage_avveckla_case\(/);
  assert.match(migration, /'SALU beslut SÄLJAS'/);
  assert.doesNotMatch(migration, /insert into public\.garage_avveckla_cases/i);
});

test('handoff is system-verified through the canonical transition engine', () => {
  for (const status of ['HANDED_OVER', 'RECEIVED', 'ACCEPTED', 'COMPLETED', 'VERIFIED']) {
    assert.match(migration, new RegExp(`public\\.transition_handoff\\(v_handoff_id, '${status}'`));
  }
  assert.match(migration, /'SYSTEM'/);
});

test('no historical backfill is introduced', () => {
  assert.match(migration, /No historical backfill/);
  assert.doesNotMatch(migration, /update public\.salu_flags[\s\S]*where closure_outcome = 'SÄLJAS'/i);
});
