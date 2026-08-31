import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync('app/garage/garage-wheel-change-panel.tsx', 'utf8');
const storageApi = readFileSync('app/api/garage/wheel-storage/route.ts', 'utf8');
const migration = readFileSync('migrations/20260901003500_wheel_change_uses_registered_storage.sql', 'utf8');

test('Hjulskifte shows registered wheel storage instead of inferring from vehicle station', () => {
  assert.match(panel, /Hjulförvaring/);
  assert.match(panel, /wheel_storage_location/);
  assert.doesNotMatch(panel, /WHEEL_STATION_BY_CITY/);
  assert.doesNotMatch(panel, /wheelStationCode\(item\.current_city\)/);
});

test('wheel storage read model uses manual edit then Incheckad storage then legacy vehicle fallback', () => {
  assert.match(storageApi, /vehicle_edits/);
  assert.match(storageApi, /hjul_forvaring_ort/);
  assert.match(storageApi, /hjul_forvaring_spec/);
  assert.match(storageApi, /wheel_storage_location/);
  assert.match(storageApi, /hasEdit \? 'EDIT' : 'NYBIL'/);
  assert.match(storageApi, /legacyStorage \? 'VEHICLES' : 'MISSING'/);
  assert.doesNotMatch(storageApi, /current_city/);
  assert.doesNotMatch(storageApi, /current_station/);
});

test('seasonal Hjulskifte snapshots registered wheel storage into the work item', () => {
  assert.match(migration, /v_storage_location text/);
  assert.match(migration, /hjul_forvaring_ort/);
  assert.match(migration, /hjul_forvaring_spec/);
  assert.match(migration, /wheel_storage_location/);
  assert.match(migration, /location,\n    note/);
  assert.match(migration, /'wheelStorageLocation', v_storage_location/);
  assert.doesNotMatch(migration, /current_city/);
  assert.doesNotMatch(migration, /current_station/);
});
