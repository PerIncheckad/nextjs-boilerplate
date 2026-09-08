import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const invariant = readFileSync(
  'migrations/20260908100500_lock_salu_garage_direction_ut_v1.sql',
  'utf8',
);
const canonical = readFileSync(
  'migrations/20260906023000_add_salu_saljas_to_garage_ut_handoff_v1.sql',
  'utf8',
);
const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const garageUi = readFileSync('app/garage/garage-client.tsx', 'utf8');

test('DB invariant fail-closes exact SALU-origin Garage direction to UT', () => {
  assert.match(invariant, /garage_items_salu_source_direction_ut_chk/);
  assert.match(invariant, /source_kind = 'SALU'/);
  assert.match(invariant, /source_salu_flag_id is not null/);
  assert.match(invariant, /garage_direction is not distinct from 'UT'/);
  assert.doesNotMatch(invariant, /\binsert\s+into\s+public\.garage_items\b/i);
  assert.doesNotMatch(invariant, /\bupdate\s+public\.garage_items\s+set\b/i);
  assert.doesNotMatch(invariant, /\bdelete\s+from\s+public\.garage_items\b/i);
});

test('service-role direction RPC explicitly rejects SALU UT to IN', () => {
  assert.match(invariant, /create or replace function public\.change_garage_direction/);
  assert.match(invariant, /v_item\.source_kind = 'SALU'/);
  assert.match(invariant, /v_item\.source_salu_flag_id is not null/);
  assert.match(invariant, /v_to is distinct from 'UT'/);
  assert.match(invariant, /source-owned AVVECKLA \/ UT/);
});

test('current Garage API rejects SALU-origin IN before calling the generic RPC', () => {
  assert.match(garageApi, /source_kind,source_salu_flag_id/);
  assert.match(garageApi, /activeItem\.source_kind === 'SALU'/);
  assert.match(garageApi, /activeItem\.source_salu_flag_id/);
  assert.match(garageApi, /nextDirection !== 'UT'/);
  assert.match(garageApi, /låst till AVVECKLA \/ UT/);
  assert.match(garageApi, /status: 409/);
});

test('Garage UI exposes no IN direction control for exact SALU-origin rows', () => {
  assert.match(garageUi, /item\.source_kind === 'SALU' && item\.source_salu_flag_id/);
  assert.match(garageUi, /<span>AVVECKLA \/ UT<\/span>/);
  assert.match(garageUi, /UTVECKLA \/ IN/);
  assert.match(garageUi, /item\.source_kind === 'SALU'[\s\S]*:\s*<select/);
});

test('other Garage source kinds keep the general IN and UT direction contract', () => {
  assert.match(invariant, /if v_to not in \('IN','UT'\)/);
  assert.match(invariant, /if v_item\.source_kind = 'SALU'[\s\S]*v_to is distinct from 'UT'/);
  assert.doesNotMatch(invariant, /source_kind = 'PLANERING'[\s\S]*raise exception/i);
  assert.doesNotMatch(invariant, /source_kind = 'MANUELL'[\s\S]*raise exception/i);
  assert.doesNotMatch(invariant, /source_kind = 'LAGER1'[\s\S]*raise exception/i);
});

test('canonical SALU materialization and verified handoff remain unchanged in contract', () => {
  assert.match(canonical, /new\.status = 'STÄNGD'/);
  assert.match(canonical, /new\.closure_outcome = 'SÄLJAS'/);
  assert.match(canonical, /v_flag\.closed_by is null or v_flag\.closed_at is null/);
  assert.match(canonical, /pg_advisory_xact_lock/);
  assert.match(canonical, /source_kind = 'SALU'/);
  assert.match(canonical, /source_salu_flag_id = v_flag\.flag_id/);
  assert.match(canonical, /garage_direction = 'UT'/);
  assert.match(canonical, /'SALU_TO_GARAGE_SALJAS'/);
  assert.match(canonical, /'VERIFIED'/);
  assert.match(canonical, /'nextAction', 'START_AVVECKLA_MANUALLY'/);
  assert.match(canonical, /'avvecklaStarted', false/);
});

test('direction invariant does not create terminal UT, AVVECKLA, Layer1 or RENTAL state', () => {
  assert.doesNotMatch(invariant, /start_garage_avveckla_case/);
  assert.doesNotMatch(invariant, /garage_avveckla_cases/);
  assert.doesNotMatch(invariant, /vehicle_journey_periods/);
  assert.doesNotMatch(invariant, /rental_operational_facts/);
  assert.doesNotMatch(invariant, /completed_at\s*=/);
});
