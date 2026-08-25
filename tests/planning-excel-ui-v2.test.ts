import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');
const planningCss = readFileSync('app/planning/planning.module.css', 'utf8');
const planningPage = readFileSync('app/planning/page.tsx', 'utf8');

test('planning UI is a dense spreadsheet workspace rather than documentation panel', () => {
  assert.match(planningUi, /PLANERINGSMATRIS/);
  assert.match(planningUi, /klistra in direkt från Excel/);
  assert.doesNotMatch(planningUi, /Systemgräns/);
  assert.match(planningCss, /max-height:calc\(100vh - 165px\)/);
  assert.match(planningCss, /position:sticky;left:0/);
  assert.match(planningCss, /position:sticky;bottom:0/);
});

test('planning spreadsheet supports keyboard movement and multi-cell paste', () => {
  assert.match(planningUi, /data-sheet-cell/);
  assert.match(planningUi, /moveSheetFocus/);
  assert.match(planningUi, /pasteSheet/);
  assert.match(planningUi, /clipboardData\.getData\('text\/plain'\)/);
  assert.match(planningUi, /split\('\\t'\)/);
});

test('planning page no longer describes a fixed station set', () => {
  assert.match(planningPage, /konfigurerbara stationer/);
  assert.doesNotMatch(planningPage, /166, 170 och 274/);
});
