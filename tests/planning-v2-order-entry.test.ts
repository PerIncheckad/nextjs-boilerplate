import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const saluApi = readFileSync('app/api/planning/salu-overview/route.ts', 'utf8');
const saluUi = readFileSync('app/planning/salu-overview.tsx', 'utf8');
const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');

test('SALU overview still shows BESTÄLLT by four planning months without netting', () => {
  assert.match(saluApi, /orderedMonthCounts/);
  assert.match(saluApi, /orderedCount: orderedByMonth\[index\]/);
  assert.match(saluUi, /SALU \/ BESTÄLLT/);
  assert.match(saluUi, /ingen automatisk nettning/);
});

test('SALU overview column widths remain user adjustable and stored locally', () => {
  assert.match(saluUi, /incheckad-planning-salu-column-widths-v1/);
  assert.match(saluUi, /type="range"/);
  assert.match(saluUi, /--model-width/);
  assert.match(saluUi, /--data-width/);
});

test('Planering v3 shows SALU window beside explicit BESTÄLLT entry', () => {
  assert.match(planningUi, /fetchPlanningBundle/);
  assert.match(planningUi, /windowTotal/);
  assert.match(planningUi, /SALU-fönster/);
  assert.match(planningUi, /\['ordered_count', 'BESTÄLLT'\]/);
  assert.match(planningUi, /model_code: row\.modelCode/);
});

test('manual BESTÄLLT is not dependent on a SALU row', () => {
  assert.match(planningUi, /\+ Märke \/ modell/);
  assert.match(planningUi, /createModel/);
  assert.match(planningUi, /list="planning-saved-brands"/);
  assert.match(planningUi, /list="planning-saved-models"/);
  assert.match(planningUi, /registryModels\.find/);
  assert.doesNotMatch(planningUi, /if \(!row\.salu\)/);
  assert.doesNotMatch(planningUi, /salu.*required/i);
});

test('SALU support still does not write planning decisions itself', () => {
  assert.doesNotMatch(saluApi, /\.from\('fleet_planning_cells'\)[\s\S]{0,500}\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(saluUi, /fetch\('\/api\/fleet-planning'.*method:\s*'PUT'/s);
});
