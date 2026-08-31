import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync('app/garage/garage-wheel-change-panel.tsx', 'utf8');

test('Hjulskifte routes operational cities to locked station codes', () => {
  assert.match(panel, /Malmö: '166'/);
  assert.match(panel, /Helsingborg: '170'/);
  assert.match(panel, /Halmstad: '274'/);
  assert.match(panel, /Varberg: '274'/);
});

test('unknown cities are not inferred into a wheel station', () => {
  assert.match(panel, /WHEEL_STATION_BY_CITY\[city\] \?\? '—'/);
});
