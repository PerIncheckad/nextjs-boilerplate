import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260829054500_planning_period_ready_gate.sql', 'utf8');
const statusApi = readFileSync('app/api/planning/period-status/route.ts', 'utf8');
const planningApi = readFileSync('app/api/fleet-planning/route.ts', 'utf8');
const planningSourceApi = readFileSync('app/api/garage/planning-sources/route.ts', 'utf8');
const handoffUi = readFileSync('app/planning/planning-garage-handoff.tsx', 'utf8');

test('planning period has explicit PAGAENDE/KLAR release state', () => {
  assert.match(migration, /planning_period_status/);
  assert.match(migration, /PAGAENDE/);
  assert.match(migration, /KLAR/);
  assert.match(statusApi, /verifyApiUser/);
  assert.match(statusApi, /planning_period_status/);
});

test('KLAR locks further planning writes until reopened', () => {
  assert.match(planningApi, /planning_period_status/);
  assert.match(planningApi, /eq\('status', 'KLAR'\)/);
  assert.match(planningApi, /Öppna planeringen igen/);
});

test('Garage materialization is server-blocked while planning is ongoing', () => {
  assert.match(planningSourceApi, /periodStatus/);
  assert.match(planningSourceApi, /gate\.status !== 'KLAR'/);
  assert.match(planningSourceApi, /Planeringen är PÅGÅENDE/);
  assert.match(planningSourceApi, /can_materialize: gate\.status === 'KLAR'/);
});

test('handoff UI exposes explicit ready/reopen control and rejects local unsaved draft', () => {
  assert.match(handoffUi, /Markera planering KLAR/);
  assert.match(handoffUi, /Öppna planering igen/);
  assert.match(handoffUi, /incheckad-planning-draft-v3/);
  assert.match(handoffUi, /Garaget är spärrat/);
});
