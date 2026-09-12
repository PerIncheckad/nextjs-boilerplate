import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CORE_NAVIGATION_ITEMS } from '../components/product-navigation-contract';
import { OPERATIONAL_NAVIGATION_ITEMS } from '../components/operational-navigation-contract';

const home = readFileSync('app/page.tsx', 'utf8');
const shell = readFileSync('components/CoreProductShell.tsx', 'utf8');
const intake = readFileSync('app/inhyrd/rented-in-intake-panel.tsx', 'utf8');
const returned = readFileSync('app/inhyrd/rented-in-return-panel.tsx', 'utf8');

const expectedCore = [
  ['/tower', 'TOWER'],
  ['/planning', 'PLANERING'],
  ['/garage', 'GARAGET'],
];

const expectedOperational = [
  ['/ankomst', 'ANKOMST'],
  ['/check', 'INCHECKNING'],
  ['/nybil', 'NY BIL'],
  ['/inhyrd', 'INHYRD'],
  ['/status', 'STATUS'],
  ['/salu', 'SALU'],
  ['/vagnkort', 'VAGNKORT'],
];

test('home and shell consume one locked CORE contract', () => {
  assert.deepEqual(CORE_NAVIGATION_ITEMS.map(({ href, label }) => [href, label]), expectedCore);
  assert.match(home, /CORE_NAVIGATION_ITEMS\.map/);
  assert.match(shell, /CORE_NAVIGATION_ITEMS\.map/);
  assert.doesNotMatch(home, /label:\s*'Tower'|label:\s*'Planering'/);
});

test('home consumes the existing locked OPERATIVT contract', () => {
  assert.deepEqual(OPERATIONAL_NAVIGATION_ITEMS.map(({ href, label }) => [href, label]), expectedOperational);
  assert.match(home, /OPERATIONAL_NAVIGATION_ITEMS\.map/);
  assert.doesNotMatch(home, /const operationModules/);
});

test('INHYRD inner panels use shared UI primitives instead of local style constants', () => {
  for (const source of [intake, returned]) {
    assert.match(source, /inner-ui-contract\.module\.css/);
    assert.doesNotMatch(source, /const shell: React\.CSSProperties/);
    assert.doesNotMatch(source, /const input: React\.CSSProperties/);
    assert.doesNotMatch(source, /const button: React\.CSSProperties/);
    assert.doesNotMatch(source, /style=\{/);
  }
});

test('INHYRD API and truth boundaries remain unchanged', () => {
  assert.match(intake, /\/api\/vehicle-journey\/rented-in-intake/);
  assert.match(intake, /historical_backfill: false/);
  assert.match(returned, /\/api\/vehicle-journey\/rented-in-return/);
  assert.match(returned, /openPeriods\.length > 0/);
  assert.match(returned, /historical_backfill: false/);
});
