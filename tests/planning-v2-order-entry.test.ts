import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const saluApi = readFileSync('app/api/planning/salu-overview/route.ts', 'utf8');
const saluUi = readFileSync('app/planning/salu-overview.tsx', 'utf8');
const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');

test('SALU overview shows BESTÄLLT by the same four planning months without netting', () => {
  assert.match(saluApi, /orderedMonthCounts/);
  assert.match(saluApi, /orderedCount: orderedByMonth\[index\]/);
  assert.match(saluUi, /SALU \/ BESTÄLLT/);
  assert.match(saluUi, /ingen automatisk nettning/);
});

test('SALU overview column widths are user adjustable and stored locally', () => {
  assert.match(saluUi, /incheckad-planning-salu-column-widths-v1/);
  assert.match(saluUi, /type="range"/);
  assert.match(saluUi, /--model-width/);
  assert.match(saluUi, /--data-width/);
});

test('Planering can use current SALU models for explicit BESTÄLLT entry', () => {
  assert.match(planningUi, /fetchPlanningBundle/);
  assert.match(planningUi, /mergeSaluModels/);
  assert.match(planningUi, /setMetric\('ordered_count'\)/);
  assert.match(planningUi, /Lägg in beställningen per modell och station/);
});

test('SALU support still does not write planning decisions itself', () => {
  assert.doesNotMatch(saluApi, /\.from\('fleet_planning_cells'\)[\s\S]{0,500}\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(saluUi, /fetch\('\/api\/fleet-planning'.*method:\s*'PUT'/s);
});
