import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync('app/planning/planning-client.tsx', 'utf8');
const planningApi = readFileSync('app/api/fleet-planning/route.ts', 'utf8');
const modelApi = readFileSync('app/api/planning/models/route.ts', 'utf8');
const saluApi = readFileSync('app/api/planning/salu-overview/route.ts', 'utf8');

test('Planering v3 keeps SALU as read support while decisions are explicit', () => {
  assert.doesNotMatch(ui, /\['salu_count', 'SALU'\]/);
  assert.doesNotMatch(ui, /\['behov_count', 'BEHOV'\]/);
  assert.match(ui, /\['utok_count', 'UTÖKNING'\]/);
  assert.match(ui, /\['minskning_count', 'MINSKNING'\]/);
  assert.match(ui, /\['ordered_count', 'BESTÄLLT'\]/);
  assert.match(ui, /SALU är beslutsstöd/);
});

test('Planering v3 uses stable model identity while preserving all planning cell fields', () => {
  assert.match(planningApi, /model_code/);
  assert.match(planningApi, /onConflict: 'period_code,model_code,station'/);
  assert.match(ui, /model_code: row\.modelCode/);
  assert.match(ui, /\.\.\.\(row\.stations\[station\.station_code\] \?\? emptyCounts\(\)\)/);
  assert.match(ui, /note: row\.note\.trim\(\) \|\| null/);
});

test('Planering v3 exposes editable model masterdata behind authenticated API', () => {
  assert.match(modelApi, /verifyApiUser/);
  assert.match(modelApi, /planning_vehicle_models/);
  for (const field of ['display_name', 'brand', 'is_electric', 'is_automatic', 'daily_rate', 'aliases', 'sort_order']) assert.match(modelApi, new RegExp(field));
  assert.match(ui, /\/api\/planning\/models/);
});

test('Planering v3 SALU window includes seven days before and after selected month', () => {
  assert.match(saluApi, /const SALU_MARGIN_DAYS = 7/);
  assert.match(saluApi, /const windowStart = addDays\(start, -SALU_MARGIN_DAYS\)/);
  assert.match(saluApi, /const windowEnd = addDays\(addMonths\(start, 1\), SALU_MARGIN_DAYS - 1\)/);
  assert.match(saluApi, /windowTotal/);
  assert.match(saluApi, /saluWindow/);
  assert.match(ui, /SALU-fönster/);
});

test('Planering v3 drafts are separate from superseded v2 drafts', () => {
  assert.match(ui, /incheckad-planning-draft-v3:/);
  assert.match(ui, /version: 3/);
  assert.match(ui, /parsed\.version !== 3/);
});
