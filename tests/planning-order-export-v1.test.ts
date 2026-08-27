import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPlanningOrderExcelCsv, planningOrderExportFilename } from '../lib/planning-order-export';

const workspace = readFileSync('app/planning/planning-workspace.tsx', 'utf8');
const button = readFileSync('app/planning/order-export-button.tsx', 'utf8');

test('Planning mounts Excel export on the shared planning month', () => {
  assert.match(workspace, /<OrderExportButton period=\{period\} \/>/);
  assert.match(button, /fleet-planning\?period=\$\{encodeURIComponent\(period\)\}/);
  assert.match(button, /Exporterar endast sparade BESTÄLLT/);
});

test('BESTÄLLT export excludes zero rows and never nets SALU', () => {
  const csv = buildPlanningOrderExcelCsv([
    { period: '2026-09', model: 'A-Klass', stationCode: '166', stationName: 'Malmö', orderedCount: 2, note: 'order' },
    { period: '2026-09', model: 'B-Klass', stationCode: '170', stationName: 'Lund', orderedCount: 0, note: 'skip' },
  ]);

  assert.match(csv, /BESTÄLLT/);
  assert.match(csv, /A-Klass/);
  assert.match(csv, /;2;/);
  assert.doesNotMatch(csv, /B-Klass/);
  assert.doesNotMatch(csv, /SALU/);
});

test('Excel CSV neutralizes spreadsheet formulas from planning text', () => {
  const csv = buildPlanningOrderExcelCsv([
    { period: '2026-09', model: '=HYPERLINK("bad")', stationCode: '166', stationName: '+Malmö', orderedCount: 1, note: '@cmd' },
  ]);

  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'\+Malmö/);
  assert.match(csv, /'@cmd/);
});

test('Excel export filename is period-scoped', () => {
  assert.equal(planningOrderExportFilename('2026-09'), 'incheckad-bestallt-2026-09.csv');
  assert.equal(planningOrderExportFilename('bad'), 'incheckad-bestallt-okand-period.csv');
});
