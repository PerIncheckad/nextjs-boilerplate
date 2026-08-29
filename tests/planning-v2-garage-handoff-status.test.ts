import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync('app/planning/planning-garage-handoff.tsx', 'utf8');
const workspace = readFileSync('app/planning/planning-workspace.tsx', 'utf8');
const route = readFileSync('app/api/garage/planning-sources/route.ts', 'utf8');
const statusRoute = readFileSync('app/api/planning/period-status/route.ts', 'utf8');

test('Planning shows a read-only BESTÄLLT to Garage handoff for the shared month', () => {
  assert.match(workspace, /<PlanningGarageHandoff period=\{period\} \/>/);
  assert.match(ui, /\/api\/garage\/planning-sources\?period=/);
  assert.match(ui, /BESTÄLLT \/ HANDSLAG/);
  assert.match(ui, /Planering → Garaget/);
});

test('KLAR is the only user action that releases BESTÄLLT to Garage', () => {
  assert.match(ui, /ordered_count/);
  assert.match(ui, /materialized_count/);
  assert.match(ui, /remaining_count/);
  assert.match(ui, /markeras KLAR skapas sparade BESTÄLLT automatiskt/);
  assert.doesNotMatch(ui, /method:\s*'POST'/);
  assert.doesNotMatch(ui, /method:\s*'PATCH'/);
  assert.match(ui, /\/api\/planning\/period-status/);
  assert.match(ui, /method:\s*'PUT'/);
  assert.match(statusRoute, /materializePlanningToGarage/);
  assert.match(statusRoute, /status === 'KLAR'/);
});

test('Garage planning source read model derives remaining from persisted BESTÄLLT and materialized units', () => {
  assert.match(route, /\.gt\('ordered_count', 0\)/);
  assert.match(route, /\.eq\('source_kind', 'PLANERING'\)/);
  assert.match(route, /remaining_count:\s*Math\.max\(0, Number\(row\.ordered_count\) - materializedCount\)/);
});
