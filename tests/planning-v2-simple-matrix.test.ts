import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync('app/planning/planning-client.tsx', 'utf8');

test('Planering v2 keeps SALU outside the decision matrix', () => {
  assert.match(ui, /SALU ovanför är endast beslutsstöd/);
  assert.doesNotMatch(ui, /\['salu_count', 'SALU'\]/);
  assert.match(ui, /\['behov_count', 'BEHOV'\]/);
  assert.match(ui, /\['utok_count', 'UTÖKNING'\]/);
  assert.match(ui, /\['minskning_count', 'MINSKNING'\]/);
  assert.match(ui, /\['ordered_count', 'BESTÄLLT'\]/);
});

test('Planering v2 shows one decision domain at a time with station columns and total', () => {
  assert.match(ui, /role="tablist" aria-label="Planeringsbeslut"/);
  assert.match(ui, /station\.station_code/);
  assert.match(ui, /Totalt/);
  assert.match(ui, /totalForRow/);
  assert.match(ui, /grandTotal/);
});

test('Planering v2 preserves all existing cell fields when saving', () => {
  assert.match(ui, /\.\.\.\(row\.stations\[station\.station_code\] \?\? emptyCounts\(\)\)/);
  assert.match(ui, /note: row\.note\.trim\(\) \|\| null/);
  assert.match(ui, /fetch\('\/api\/fleet-planning'/);
});

test('Planering v2 preserves existing drafts and uses model masterdata', () => {
  assert.match(ui, /incheckad-planning-draft:/);
  assert.match(ui, /parsed\.version !== 1 && parsed\.version !== 2/);
  assert.match(ui, /pivot\(payload\.data \?\? \[\], nextStations, nextModels\)/);
  assert.match(ui, /for \(const model of \[\.\.\.models\]/);
});
