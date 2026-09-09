import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OPERATIONAL_NAVIGATION_ITEMS } from '../components/operational-navigation-contract';

const shell = readFileSync('components/CoreProductShell.tsx', 'utf8');
const navigation = readFileSync('components/OperationalNavigation.tsx', 'utf8');
const navigationCss = readFileSync('components/operational-navigation.module.css', 'utf8');

const expected = [
  ['/ankomst', 'ANKOMST'],
  ['/check', 'INCHECKNING'],
  ['/nybil', 'NY BIL'],
  ['/inhyrd', 'INHYRD'],
  ['/status', 'STATUS'],
  ['/salu', 'SALU'],
  ['/vagnkort', 'VAGNKORT'],
] as const;

const operationalPages = [
  ['app/ankomst/page.tsx', '/ankomst'],
  ['app/check/page.tsx', '/check'],
  ['app/nybil/page.tsx', '/nybil'],
  ['app/status/page.tsx', '/status'],
  ['app/salu/page.tsx', '/salu'],
  ['app/vagnkort/page.tsx', '/vagnkort'],
] as const;

test('OPERATIVT has exactly seven locked routes, labels and order', () => {
  assert.deepEqual(
    OPERATIONAL_NAVIGATION_ITEMS.map(({ href, label }) => [href, label]),
    expected,
  );
  assert.equal(OPERATIONAL_NAVIGATION_ITEMS.some(({ href }) => String(href) === '/operativt'), false);
});

test('CoreProductShell groups OPERATIVT without duplicating INHYRD as a root link', () => {
  assert.match(shell, /<OperationalNavigation[\s\S]*variant="sidebar"/);
  assert.match(shell, /active=\{active === 'inhyrd' \? '\/inhyrd' : undefined\}/);
  assert.doesNotMatch(shell, /\['\/inhyrd',\s*'INHYRD'/);
  assert.doesNotMatch(shell, /\['\/salu',\s*'SALU'/);
});

test('operational pages consume the shared contract with their own active route', () => {
  for (const [path, route] of operationalPages) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /OperationalNavigation/);
    assert.match(source, new RegExp(`<OperationalNavigation active="${route.replace('/', '\\/')}" \\/>`));
  }
});

test('active-state and mobile expansion remain navigation concerns', () => {
  assert.match(navigation, /aria-current=\{item\.href === active \? 'page' : undefined\}/);
  assert.match(navigation, /<details className=\{styles\.mobileNavigation\}>/);
  assert.match(navigation, /<summary>/);
  assert.match(navigationCss, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});
