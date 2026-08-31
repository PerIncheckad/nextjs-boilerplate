import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const wheelRoute = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const allowedPlatesRoute = readFileSync('app/api/allowed-plates/route.ts', 'utf8');

test('seasonal Hjulskifte reuses the operational sold sources from allowed plates', () => {
  for (const source of ['nybil_inventering', 'vehicle_edits']) {
    assert.match(allowedPlatesRoute, new RegExp(source));
    assert.match(wheelRoute, new RegExp(source));
  }
  assert.match(wheelRoute, /field_name', 'is_sold'/);
  assert.match(wheelRoute, /readSoldRegnrs/);
});

test('sold vehicles are filtered from seasonal candidates and rejected on direct POST', () => {
  assert.match(wheelRoute, /!soldRegnrs\.has\(regnr\)/);
  assert.match(wheelRoute, /if \(soldRegnrs\.has\(regnr\)\)/);
  assert.match(wheelRoute, /Bilen är markerad som såld/);
  assert.match(wheelRoute, /LATEST_COMPLETED_CHECKIN_PLUS_CURRENT_SALU_EXCLUDING_SOLD/);
});
