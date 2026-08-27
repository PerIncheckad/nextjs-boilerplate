import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/planning/page.tsx', 'utf8');
const workspace = readFileSync('app/planning/planning-workspace.tsx', 'utf8');
const salu = readFileSync('app/planning/salu-overview.tsx', 'utf8');
const matrix = readFileSync('app/planning/planning-client.tsx', 'utf8');

test('Planering v2 has one shared planning month for SALU and decision matrix', () => {
  assert.match(page, /<PlanningWorkspace \/>/);
  assert.match(workspace, /const \[period, setPeriod\] = useState\(currentPeriod\)/);
  assert.match(workspace, /<SaluOverview period=\{period\} onPeriodChange=\{setPeriod\} \/>/);
  assert.match(workspace, /<FleetPlanningClient selectedPeriod=\{period\} onPeriodChange=\{setPeriod\} \/>/);
  assert.match(salu, /Planeringsmånad/);
  assert.match(matrix, /selectedPeriod/);
  assert.match(matrix, /onPeriodChange\(nextPeriod\)/);
});

test('changing shared month reloads both read support and planning cells', () => {
  assert.match(salu, /salu-overview\?period=\$\{encodeURIComponent\(period\)\}/);
  assert.match(matrix, /fleet-planning\?period=\$\{encodeURIComponent\(nextPeriod\)\}/);
  assert.match(matrix, /fetchPlanningBundle\(selectedPeriod\)/);
});
