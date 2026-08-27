import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync('docs/db/planning_replacement_decisions_v1.sql', 'utf8');
const api = readFileSync('app/api/planning/replacement-decisions/route.ts', 'utf8');
const ui = readFileSync('app/planning/salu-overview.tsx', 'utf8');

test('replacement is an explicit planning decision keyed by canonical regnr', () => {
  assert.match(schema, /create table if not exists public\.planning_replacement_decisions/);
  assert.match(schema, /regnr text primary key/);
  assert.match(schema, /decision_status.*REPLACE.*CANCELLED/s);
  assert.match(schema, /salu_date_at_decision date not null/);
  assert.match(schema, /decided_by uuid not null/);
});

test('replacement storage remains private behind authenticated server API', () => {
  assert.match(schema, /enable row level security/);
  assert.match(schema, /revoke all on public\.planning_replacement_decisions from anon, authenticated/);
  assert.match(schema, /grant all on public\.planning_replacement_decisions to service_role/);
  assert.match(api, /verifyApiUser/);
  assert.match(api, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('replacement validates against current SALU but does not mutate SALU', () => {
  assert.match(api, /from\('salu_vehicle_state'\)/);
  assert.match(api, /current_saludatum/);
  assert.match(api, /currentSaluDate !== saluDate/);
  assert.match(api, /STALE_SALU_DATE/);
  assert.match(api, /status: 409/);
  assert.doesNotMatch(api, /from\('salu_vehicle_state'\)[\s\S]{0,300}\.(update|upsert|insert|delete)\(/);
  assert.doesNotMatch(api, /fleet_planning_cells/);
  assert.doesNotMatch(api, /garage_items/);
});

test('replacement missing storage recognizes both Postgres and PostgREST table-missing errors', () => {
  assert.match(api, /42P01/);
  assert.match(api, /PGRST205/);
  assert.match(api, /isMissingDecisionStorage/);
});

test('replacement does not automatically create planning quantities', () => {
  for (const field of ['behov_count', 'utok_count', 'minskning_count', 'ordered_count']) {
    assert.doesNotMatch(api, new RegExp(field));
    assert.doesNotMatch(schema, new RegExp(field));
  }
  assert.match(schema, /does not create BEHOV, UTOKNING, MINSKNING or BESTALLT/);
});

test('SALU drilldown exposes one-click explicit replacement with reversible status', () => {
  assert.match(ui, /ERSÄTT/);
  assert.match(ui, /ERSÄTTS ✓/);
  assert.match(ui, /decisionStatus: nextStatus/);
  assert.match(ui, /active \? 'CANCELLED' : 'REPLACE'/);
  assert.match(ui, /decisionStorageReady === false/);
});
