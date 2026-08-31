import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync('app/garage/garage-wheel-change-panel.tsx', 'utf8');

test('Hjulskifte does not infer wheel storage from vehicle city or station', () => {
  assert.doesNotMatch(panel, /Malmö: '166'/);
  assert.doesNotMatch(panel, /Helsingborg: '170'/);
  assert.doesNotMatch(panel, /Halmstad: '274'/);
  assert.doesNotMatch(panel, /Varberg: '274'/);
  assert.doesNotMatch(panel, /wheelStationCode\(item\.current_city\)/);
});

test('Hjulskifte presents registered wheel storage as the operational fact', () => {
  assert.match(panel, /Hjulförvaring/);
  assert.match(panel, /wheel_storage_location/);
  assert.match(panel, /Saknas/);
});
