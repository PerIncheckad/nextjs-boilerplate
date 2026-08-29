import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');
const planningPage = readFileSync('app/planning/page.tsx', 'utf8');

test('planning UI follows the current decision work-surface order', () => {
  assert.match(planningUi, /MÄRKE · MODELL · EL · stationer · SUMMA · SALU · DYGNDEB/);
  assert.match(planningUi, /className=\{styles\.modelColumn\}>Märke/);
  assert.match(planningUi, /className=\{styles\.modelColumn\}>Modell/);
  assert.match(planningUi, /className=\{styles\.flagColumn\}>EL/);
  assert.match(planningUi, />Summa<\/th><th className=\{styles\.saluColumn\}>SALU<\/th>/);
  assert.match(planningUi, /className=\{styles\.rateColumn\}>Dygnsdeb<\/th>/);
  assert.doesNotMatch(planningUi, /className=\{styles\.flagColumn\}>AUT/);
});

test('planning removes BEHOV as an active decision and keeps three explicit decision domains', () => {
  assert.doesNotMatch(planningUi, /\['behov_count', 'BEHOV'\]/);
  for (const label of ['UTÖKNING', 'MINSKNING', 'BESTÄLLT']) assert.match(planningUi, new RegExp(label));
  assert.match(planningUi, /role="tablist" aria-label="Planeringsbeslut"/);
});

test('planning makes brand, model, EL and daily rate editable while PAGAENDE and read-only when KLAR', () => {
  assert.match(planningUi, /value=\{row\.brand\}[^>]*onChange=\{\(event\) => updateModel\(row\.key, \{ brand: event\.target\.value \}\)\}/);
  assert.match(planningUi, /value=\{row\.model\}[^>]*onChange=\{\(event\) => updateModel\(row\.key, \{ model: event\.target\.value \}\)\}/);
  assert.match(planningUi, /type="checkbox" checked=\{row\.isElectric\} disabled=\{locked\}/);
  assert.match(planningUi, /row\.dailyRate/);
  assert.match(planningUi, /disabled=\{locked\}/);
  assert.match(planningUi, /\/api\/planning\/models/);
  assert.match(planningUi, /\+ Märke \/ modell/);
  assert.match(planningUi, /list="planning-saved-brands"/);
  assert.match(planningUi, /datalist id="planning-saved-brands"/);
  assert.match(planningUi, /list="planning-saved-models"/);
  assert.match(planningUi, /datalist id="planning-saved-models"/);
});

test('saved brand and model can reuse stable model identity', () => {
  assert.match(planningUi, /registryModels\.find/);
  assert.match(planningUi, /existing\?\.model_code/);
  assert.match(planningUi, /alreadyInPeriod/);
});

test('planning period list is built from period cells instead of every master model', () => {
  assert.match(planningUi, /const modelsByCode = new Map\(models\.map/);
  assert.match(planningUi, /for \(const cell of cells\)/);
  assert.doesNotMatch(planningUi, /for \(const model of \[\.\.\.models\]/);
  assert.match(planningUi, /periodRows = stations\.map/);
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