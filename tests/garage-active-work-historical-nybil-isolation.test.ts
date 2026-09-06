import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const handoffApi = readFileSync('app/api/garage/nybil-handoff/route.ts', 'utf8');

test('active Garage list isolates IN rows whose regnr already exists in Nybil', () => {
  assert.match(garageApi, /from\('nybil_inventering'\)/);
  assert.match(garageApi, /loadNybilRegKeys/);
  assert.match(garageApi, /row\.garage_direction !== 'IN'/);
  assert.match(garageApi, /!nybilRegKeys\.has\(key\)/);
});

test('historical overlap isolation never creates a historical handshake', () => {
  assert.doesNotMatch(garageApi, /source_garage_item_id\s*:/);
  assert.doesNotMatch(garageApi, /handed_off_at\s*:/);
  assert.doesNotMatch(handoffApi, /\.update\(/);
  assert.doesNotMatch(handoffApi, /\.insert\(/);
  assert.doesNotMatch(handoffApi, /\.delete\(/);
});

test('AVVECKLA is not hidden merely because the regnr exists in Nybil', () => {
  assert.match(garageApi, /if \(row\.garage_direction !== 'IN'\) return true/);
});
