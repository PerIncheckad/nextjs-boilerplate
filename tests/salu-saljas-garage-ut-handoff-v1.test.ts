import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'migrations/20260906023000_add_salu_saljas_to_garage_ut_handoff_v1.sql',
  'utf8',
);
const avvecklaFoundation = readFileSync(
  'migrations/20260902230000_add_garage_avveckla_foundation_v1.sql',
  'utf8',
);
const avvecklaApi = readFileSync('app/api/garage/avveckla/route.ts', 'utf8');
const avvecklaPanel = readFileSync('app/garage/garage-avveckla-panel.tsx', 'utf8');

test('only closed SALU with SÄLJAS can materialize the future Garage UT handoff', () => {
  assert.match(migration, /new\.status = 'STÄNGD'/);
  assert.match(migration, /new\.closure_outcome = 'SÄLJAS'/);
  assert.match(migration, /v_flag\.status <> 'STÄNGD'/);
  assert.match(migration, /v_flag\.closure_outcome <> 'SÄLJAS'/);
  assert.doesNotMatch(migration, /closure_outcome = 'PLANERA VERKSTAD'/);
  assert.doesNotMatch(migration, /closure_outcome = 'FÖRLÄNGA'/);
});

test('exact SALU cycle remains source-owned and traceable in Garage and handoff', () => {
  assert.match(migration, /source_kind = 'SALU'/);
  assert.match(migration, /source_salu_flag_id = v_flag\.flag_id/);
  assert.match(migration, /'SALU_TO_GARAGE_SALJAS'/);
  assert.match(migration, /'salu_flags'/);
  assert.match(migration, /v_flag\.flag_id::text/);
  assert.match(migration, /'salu-manual-close:' \|\| v_flag\.flag_id::text/);
});

test('SÄLJAS materializes Garage direction UT without inventing physical station', () => {
  assert.match(migration, /garage_direction = 'UT'/);
  assert.match(migration, /planning_reason = 'SALU'/);
  assert.doesNotMatch(migration, /planned_station\s*,[\s\S]*v_flag/i);
  assert.doesNotMatch(migration, /planned_station\s*,[\s\S]*'BEKRAFTAD'/i);
});

test('handoff ends at Garage and does not auto-start AVVECKLA', () => {
  assert.match(migration, /'BILKONTROLL'/);
  assert.match(migration, /'GARAGE'/);
  assert.match(migration, /'nextAction', 'START_AVVECKLA_MANUALLY'/);
  assert.match(migration, /'avvecklaStarted', false/);
  assert.doesNotMatch(migration, /start_garage_avveckla_case\s*\(/);
  assert.doesNotMatch(migration, /garage_avveckla_cases/);
});

test('existing AVVECKLA manual entrypoint remains the only start contract', () => {
  assert.match(avvecklaFoundation, /start_garage_avveckla_case/);
  assert.match(avvecklaFoundation, /Orsak krävs/);
  assert.match(avvecklaApi, /action === 'START_CASE'/);
  assert.match(avvecklaPanel, /Starta AVVECKLA/);
  assert.match(avvecklaPanel, /Orsak/);
});

test('no Layer 1, RENTAL, terminal UT or historical backfill is introduced', () => {
  assert.doesNotMatch(migration, /vehicle_journey_periods/);
  assert.doesNotMatch(migration, /rental_operational_facts/);
  assert.doesNotMatch(migration, /complete_garage_avveckla_ut_internal/);
  assert.doesNotMatch(migration, /UT_OVERLAMNING_VERIFIERAD|UT_TRANSPORTOR_HAMTAT_VERIFIERAD|UT_AVSTALLNING_VERIFIERAD/);
  assert.match(migration, /No historical backfill/);
  assert.doesNotMatch(migration, /update public\.salu_flags[\s\S]*where closure_outcome = 'SÄLJAS'/i);
});
