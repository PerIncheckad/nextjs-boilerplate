import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');
const planningPage = readFileSync('app/planning/page.tsx', 'utf8');

test('planning UI is a simple decision matrix rather than the superseded wide spreadsheet', () => {
  assert.match(planningUi, /const DECISIONS/);
  assert.match(planningUi, /Modell \| stationer \| totalt/);
  assert.match(planningUi, /data-planning-cell/);
  assert.match(planningUi, /stations\.map/);
  assert.doesNotMatch(planningUi, /data-sheet-cell/);
  assert.doesNotMatch(planningUi, /pasteSheet/);
  assert.doesNotMatch(planningUi, /klistra in från Excel/);
  assert.doesNotMatch(planningUi, /Systemgräns/);
});

test('planning matrix supports direct keyboard movement while one decision domain is active', () => {
  assert.match(planningUi, /moveFocus/);
  assert.match(planningUi, /event\.key !== 'Enter'/);
  assert.match(planningUi, /querySelectorAll<HTMLInputElement>\('input\[data-planning-cell="true"\]'\)/);
  assert.match(planningUi, /aria-selected=\{metric === key\}/);
  for (const label of ['BEHOV', 'UTÖKNING', 'MINSKNING', 'BESTÄLLT']) assert.match(planningUi, new RegExp(label));
});

test('planning page no longer describes a fixed station set', () => {
  assert.match(planningPage, /konfigurerbara stationer/);
  assert.doesNotMatch(planningPage, /166, 170 och 274/);
});
