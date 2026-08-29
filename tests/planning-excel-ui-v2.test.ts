import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');
const planningPage = readFileSync('app/planning/page.tsx', 'utf8');

test('planning UI follows the v3 work-surface order with SALU after SUMMA', () => {
  assert.match(planningUi, /MODELL · EL · AUT · DYGNDEB · stationer · SUMMA · SALU/);
  assert.match(planningUi, />Summa<\/th><th className=\{styles\.saluColumn\}>SALU<\/th>/);
  assert.match(planningUi, /className=\{styles\.modelColumn\}>Modell/);
  assert.match(planningUi, /className=\{styles\.flagColumn\}>EL/);
  assert.match(planningUi, /className=\{styles\.flagColumn\}>AUT/);
  assert.match(planningUi, /className=\{styles\.rateColumn\}>Dygnsdeb/);
});

test('planning v3 removes BEHOV as an active decision and keeps three explicit decision domains', () => {
  assert.doesNotMatch(planningUi, /\['behov_count', 'BEHOV'\]/);
  for (const label of ['UTÖKNING', 'MINSKNING', 'BESTÄLLT']) assert.match(planningUi, new RegExp(label));
  assert.match(planningUi, /role="tablist" aria-label="Planeringsbeslut"/);
});

test('planning v3 makes model masterdata editable from the work surface', () => {
  assert.match(planningUi, /modelNameInput/);
  assert.match(planningUi, /type="checkbox" checked=\{row\.isElectric\}/);
  assert.match(planningUi, /type="checkbox" checked=\{row\.isAutomatic\}/);
  assert.match(planningUi, /row\.dailyRate/);
  assert.match(planningUi, /\/api\/planning\/models/);
  assert.match(planningUi, /\+ Modell/);
});

test('planning matrix retains fast keyboard entry for station counts', () => {
  assert.match(planningUi, /moveFocus/);
  assert.match(planningUi, /event\.key !== 'Enter'/);
  assert.match(planningUi, /querySelectorAll<HTMLInputElement>\('input\[data-planning-cell="true"\]'\)/);
  assert.match(planningUi, /data-planning-cell="true"/);
});

test('planning page does not hard-code the station set', () => {
  assert.match(planningPage, /konfigurerbara stationer/);
  assert.doesNotMatch(planningPage, /166, 170 och 274/);
});
