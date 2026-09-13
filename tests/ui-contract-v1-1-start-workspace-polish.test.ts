import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync('app/page.tsx', 'utf8');
const homeCss = readFileSync('app/home.module.css', 'utf8');
const shell = readFileSync('components/CoreProductShell.tsx', 'utf8');
const shellCss = readFileSync('components/core-product-shell.module.css', 'utf8');
const operationalCss = readFileSync('components/operational-navigation.module.css', 'utf8');
const innerUi = readFileSync('components/inner-ui-contract.module.css', 'utf8');

test('home keeps CORE and OPERATIVT sourced from shared navigation contracts', () => {
  assert.match(home, /CORE_NAVIGATION_ITEMS\.map/);
  assert.match(home, /OPERATIONAL_NAVIGATION_ITEMS\.map/);
  assert.doesNotMatch(home, /const\s+operationModules/);
});

test('shared shell preserves the 1440 workspace contract and responsive containment', () => {
  assert.match(shellCss, /1440px/);
  assert.match(shellCss, /\.content\s*\{/);
  assert.match(shellCss, /overflow-x:\s*auto/);
  assert.match(operationalCss, /max-width:\s*1440px/);
});

test('UI Contract V1.1 exposes shared presentation primitives', () => {
  for (const className of [
    'sectionHeader',
    'filterRow',
    'secondaryButton',
    'kpiGrid',
    'kpiCard',
    'statusBadge',
    'tableWrap',
    'table',
    'emptyState',
    'loadingState',
  ]) {
    assert.match(innerUi, new RegExp(`\\.${className}\\b`));
  }
});

test('home and shell polish contain explicit hover/focus and mobile presentation states', () => {
  assert.match(homeCss, /:focus-visible/);
  assert.match(shellCss, /:focus-visible/);
  assert.match(operationalCss, /:focus-visible/);
  assert.match(homeCss, /@media\s*\(max-width:\s*700px\)/);
  assert.match(shellCss, /@media\s*\(max-width:\s*700px\)/);
});

test('V1.1 shared presentation layer does not introduce API, auth or business-state behavior', () => {
  for (const source of [home, shell, homeCss, shellCss, operationalCss, innerUi]) {
    assert.doesNotMatch(source, /authenticatedApiFetch|fetch\s*\(|\/api\//);
  }
});
