import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync('app/planning/planning-garage-handoff.tsx', 'utf8');
const workspace = readFileSync('app/planning/planning-workspace.tsx', 'utf8');
const route = readFileSync('app/api/garage/planning-sources/route.ts', 'utf8');

test('Planning shows a read-only BESTÄLLT to Garage handoff for the shared month', () => {
  assert.match(workspace, /<PlanningGarageHandoff period=\{period\} \/>/);
  assert.match(ui, /\/api\/garage\/planning-sources\?period=/);
  assert.match(ui, /BESTÄLLT \/ HANDSLAG/);
  assert.match(ui, /Planering → Garaget/);
});

test('handoff exposes ordered, materialized and remaining quantities without automatic transfer', () => {
  assert.match(ui, /ordered_count/);
  assert.match(ui, /materialized_count/);
  assert.match(ui, /remaining_count/);
  assert.match(ui, /Ingen automatisk överföring/);
  assert.doesNotMatch(ui, /method:\s*'POST'/);
  assert.doesNotMatch(ui, /method:\s*'PATCH'/);
  assert.match(ui, /\/api\/planning\/period-status/);
  assert.match(ui, /method:\s*'PUT'/);
});

test('Garage planning source read model derives remaining from persisted BESTÄLLT and materialized units', () => {
  assert.match(route, /\.gt\('ordered_count', 0\)/);
  assert.match(route, /\.eq\('source_kind', 'PLANERING'\)/);
  assert.match(route, /remaining_count:\s*Math\.max\(0, Number\(row\.ordered_count\) - materializedCount\)/);
});
