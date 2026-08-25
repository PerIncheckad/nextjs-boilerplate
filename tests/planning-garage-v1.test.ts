import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260825201500_add_planning_and_garage_v1.sql', 'utf8');
const planningApi = readFileSync('app/api/fleet-planning/route.ts', 'utf8');
const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');
const garageUi = readFileSync('app/garage/garage-client.tsx', 'utf8');

test('planning is station adapted to exactly 166, 170 and 274', () => {
  assert.match(migration, /station in \('166', '170', '274'\)/);
  assert.match(planningApi, /new Set\(\['166', '170', '274'\]\)/);
  assert.match(planningUi, /const STATIONS = \['166', '170', '274'\] as const/);
});

test('planning keeps the locked business concepts separate', () => {
  for (const field of ['salu_count', 'behov_count', 'utok_count', 'minskning_count', 'ordered_count']) {
    assert.match(migration, new RegExp(field));
    assert.match(planningApi, new RegExp(field));
    assert.match(planningUi, new RegExp(field));
  }
  assert.match(planningUi, /SALU/);
  assert.match(planningUi, /BEHOV/);
  assert.match(planningUi, /UTÖK/);
  assert.match(planningUi, /MINSKNING/);
  assert.match(planningUi, /BESTÄLLT/);
});

test('planning and Garage writes stay behind authenticated APIs and service role', () => {
  assert.match(planningApi, /verifyApiUser/);
  assert.match(garageApi, /verifyApiUser/);
  assert.match(planningApi, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(garageApi, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(migration, /revoke all on public\.fleet_planning_cells from anon, authenticated/);
  assert.match(migration, /revoke all on public\.garage_items from anon, authenticated/);
});

test('Garage is an independent planning domain and preserves station replanning history', () => {
  assert.match(migration, /Garaget planning objects|Garage planning objects/);
  assert.match(migration, /outside Layer 1 and Layer 2/);
  assert.match(migration, /garage_station_events/);
  assert.match(garageApi, /stationChanged/);
  assert.match(garageApi, /garage_station_events/);
  assert.match(garageUi, /Omplanerad i Garaget/);
});

test('Garage supports pre-identity cars, SALU return and planned operating fields without Kistan semantics', () => {
  assert.match(migration, /regnr text/);
  assert.match(migration, /vin text/);
  assert.match(migration, /SALU_RETUR/);
  assert.match(migration, /saluort text/);
  assert.match(migration, /daily_rate numeric/);
  assert.match(migration, /Not verified monetary consequence and not Kistan output/);
  assert.match(garageUi, /Reg\.nr\/VIN får vara tomt/);
  assert.match(garageUi, /SALU RETUR/);
  assert.match(garageUi, /Dygnsdebitering/);
});
