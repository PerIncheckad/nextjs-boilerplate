import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const retirement = readFileSync(
  'migrations/20260908011000_retire_legacy_salu_garage_materializer_v1.sql',
  'utf8',
);
const canonical = readFileSync(
  'migrations/20260906023000_add_salu_saljas_to_garage_ut_handoff_v1.sql',
  'utf8',
);

test('legacy SALU to Garage materializer is retired exactly without CASCADE or compatibility path', () => {
  assert.match(
    retirement,
    /drop function public\.materialize_salu_to_garage\(uuid, text, text, uuid\);/i,
  );
  assert.doesNotMatch(retirement, /cascade/i);
  assert.doesNotMatch(retirement, /create\s+(?:or\s+replace\s+)?function/i);
});

test('retirement migration is schema-only and does not alter historical data or other schema objects', () => {
  assert.doesNotMatch(retirement, /\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\./i);
  assert.doesNotMatch(retirement, /alter\s+table|create\s+table|drop\s+table|create\s+(?:unique\s+)?index|drop\s+index/i);
  assert.doesNotMatch(retirement, /grant\s|revoke\s/i);
});

test('canonical SALU materializer remains the only locked future contract', () => {
  assert.match(canonical, /create or replace function public\.materialize_salu_saljas_to_garage_ut_v1\(/i);
  assert.match(canonical, /v_flag\.status <> 'STÄNGD'/);
  assert.match(canonical, /v_flag\.closure_outcome <> 'SÄLJAS'/);
  assert.match(canonical, /v_flag\.closed_by is null or v_flag\.closed_at is null/);
  assert.match(canonical, /pg_advisory_xact_lock/);
  assert.match(canonical, /source_kind = 'SALU'/);
  assert.match(canonical, /source_salu_flag_id = v_flag\.flag_id/);
  assert.match(canonical, /garage_direction = 'UT'/);
  assert.match(canonical, /'SALU_TO_GARAGE_SALJAS'/);
});

test('canonical trigger remains present and AVVECKLA remains manual', () => {
  assert.match(canonical, /create trigger salu_saljas_to_garage_ut_write_through/i);
  assert.match(canonical, /execute function public\.write_through_salu_saljas_to_garage_ut_v1\(\)/i);
  assert.match(canonical, /'nextAction', 'START_AVVECKLA_MANUALLY'/);
  assert.match(canonical, /'avvecklaStarted', false/);
  assert.doesNotMatch(canonical, /(?:perform|select)\s+public\.start_garage_avveckla_case\s*\(/i);
});

test('canonical SALU handoff fabricates neither Layer1 nor RENTAL truth', () => {
  assert.doesNotMatch(canonical, /vehicle_journey_periods/);
  assert.doesNotMatch(canonical, /rental_operational_facts/);
});
