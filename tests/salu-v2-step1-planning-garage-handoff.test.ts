import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('migrations/20260915133000_salu_v2_step1_planning_garage_handoff.sql', 'utf8');
const planningApi = readFileSync('app/api/salu/planning/route.ts', 'utf8');
const legacyDecisionApi = readFileSync('app/api/salu/decision/route.ts', 'utf8');
const saluUi = readFileSync('app/salu/salu-decision-client.tsx', 'utf8');
const saluPage = readFileSync('app/salu/page.tsx', 'utf8');
const historicalSaluGarage = readFileSync('migrations/20260906023000_add_salu_saljas_to_garage_ut_handoff_v1.sql', 'utf8');

test('PLANERAD SALU is a separate non-terminal planning fact', () => {
  assert.match(migration, /create table public\.salu_plans/i);
  assert.match(migration, /status text not null default 'PLANERAD'/i);
  assert.match(migration, /planning_mode in \('QUICK','INDIVIDUAL'\)/i);
  assert.doesNotMatch(migration, /update public\.salu_flags[\s\S]*status\s*=\s*'STÄNGD'/i);
  assert.doesNotMatch(migration, /close_salu_flag_manually/i);
});

test('planning creates exact Garage work responsibility without physical or terminal semantics', () => {
  assert.match(migration, /'SALU_PLANERING'/);
  assert.match(migration, /source_salu_flag_id/);
  assert.match(migration, /'SALU_TO_GARAGE_PLANNING'/);
  assert.match(migration, /'physicalLocationChanged', false/);
  assert.match(migration, /'terminalClosure', false/);
  assert.match(migration, /'avvecklaStarted', false/);
  assert.match(migration, /v_model,\s*null,\s*'SALU'/s);
  assert.doesNotMatch(migration, /start_garage_avveckla_case/i);
  assert.doesNotMatch(migration, /canonical_fleet/i);
});

test('planning write is idempotent per exact SALU cycle', () => {
  assert.match(migration, /flag_id uuid not null unique references public\.salu_flags/);
  assert.match(migration, /garage_items_salu_planning_source_uidx/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /idempotentReplay', true/);
  assert.match(migration, /ensure_handoff_from_source/);
});

test('historical STÄNGD + SÄLJAS bridge remains historical while future SÄLJAS closure is blocked', () => {
  assert.match(historicalSaluGarage, /status <> 'STÄNGD' or v_flag\.closure_outcome <> 'SÄLJAS'/i);
  assert.match(historicalSaluGarage, /source_kind,\s*source_salu_flag_id/s);
  assert.match(historicalSaluGarage, /'SALU_TO_GARAGE_SALJAS'/);
  assert.match(legacyDecisionApi, /if \(outcome === 'SÄLJAS'\)/);
  assert.match(legacyDecisionApi, /SÄLJAS planeras via SALU PLANERING/);
});

test('SALU UI exposes both quick and individual planning without redefining source-owned vehicle truth', () => {
  assert.match(saluUi, /type="checkbox"/);
  assert.match(saluUi, />PLANERAD SALU</);
  assert.match(saluUi, /planning_mode: 'QUICK'/);
  assert.match(saluUi, /planning_mode: 'INDIVIDUAL'/);
  assert.match(saluUi, /authenticatedApiFetch\(`\/api\/vehicle-journey\?reg=/);
  assert.match(saluUi, /\/vagnkort\?reg=/);
  assert.match(saluUi, /Planerat SALU-datum/);
  assert.match(saluUi, /Föreslaget slutdatum/);
  assert.match(saluUi, /SALU-ort \/ destination/);
  assert.match(saluUi, /Reparation \/ verkstad/);
  assert.match(saluUi, /Boka transport senast/);
  assert.match(saluUi, /Planeringsinformation/);
  assert.doesNotMatch(saluUi, /from\(['"]damages['"]\)/);
  assert.doesNotMatch(saluUi, /from\(['"]vehicle_journey_events['"]\)/);
});

test('planning API is authenticated and delegates the write to the atomic RPC', () => {
  assert.match(planningApi, /verifyApiUser/);
  assert.match(planningApi, /admin\.rpc\('plan_salu_for_garage_v2'/);
  assert.match(planningApi, /\.neq\('status', 'STÄNGD'\)/);
});

test('SALU page describes planning and handoff, not terminal closure', () => {
  assert.match(saluPage, /Planera först\. Genomför sedan\./);
  assert.match(saluPage, /Planera SALU/);
  assert.match(saluPage, /Lämna över/);
  assert.doesNotMatch(saluPage, /slutbeslut/i);
});
