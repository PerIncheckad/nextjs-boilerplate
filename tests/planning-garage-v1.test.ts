import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260825201500_add_planning_and_garage_v1.sql', 'utf8');
const modelMigration = readFileSync('migrations/20260825205500_add_planning_vehicle_models_v1.sql', 'utf8');
const directionMigration = readFileSync('migrations/20260825211000_add_garage_direction_v1.sql', 'utf8');
const planningApi = readFileSync('app/api/fleet-planning/route.ts', 'utf8');
const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');
const garageUi = readFileSync('app/garage/garage-client.tsx', 'utf8');

test('planning starts with 166, 170 and 274 but station growth is configuration, not code', () => {
  assert.match(migration, /create table if not exists public\.planning_stations/);
  for (const station of ['166', '170', '274']) assert.match(migration, new RegExp(`\\('${station}'`));
  assert.match(migration, /references public\.planning_stations\(station_code\)/);
  assert.match(planningApi, /from\('planning_stations'\)/);
  assert.match(garageApi, /from\('planning_stations'\)/);
  assert.doesNotMatch(planningUi, /const STATIONS/);
  assert.doesNotMatch(garageUi, /const STATIONS/);
  assert.match(planningUi, /stations\.map/);
  assert.match(garageUi, /stations\.map/);
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

test('planning and Garage share a reusable model registry', () => {
  assert.match(modelMigration, /create table if not exists public\.planning_vehicle_models/);
  assert.match(modelMigration, /model_code text primary key/);
  assert.match(modelMigration, /upper\(trim\(model\)\)/);
  assert.match(planningApi, /from\('planning_vehicle_models'\)/);
  assert.match(garageApi, /from\('planning_vehicle_models'\)/);
  assert.match(planningUi, /planning-models/);
  assert.match(garageUi, /garage-models/);
  assert.match(planningUi, /Välj eller skriv modell/);
  assert.match(garageUi, /Välj eller skriv modell/);
});

test('planning and Garage writes stay behind authenticated APIs and service role', () => {
  assert.match(planningApi, /verifyApiUser/);
  assert.match(garageApi, /verifyApiUser/);
  assert.match(planningApi, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(garageApi, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(modelMigration, /revoke all on public\.planning_vehicle_models from anon, authenticated/);
  assert.match(directionMigration, /revoke all on public\.garage_direction_events from anon, authenticated/);
  assert.match(migration, /revoke all on public\.planning_stations from anon, authenticated/);
  assert.match(migration, /revoke all on public\.fleet_planning_cells from anon, authenticated/);
  assert.match(migration, /revoke all on public\.garage_items from anon, authenticated/);
});

test('Garage is an independent planning domain and preserves station replanning history', () => {
  assert.match(migration, /Garage planning objects/);
  assert.match(migration, /outside Layer 1 and Layer 2/);
  assert.match(migration, /garage_station_events/);
  assert.match(garageApi, /stationChanged/);
  assert.match(garageApi, /garage_station_events/);
  assert.match(garageUi, /Omplanerad i Garaget/);
});

test('Garage has explicit UTVECKLA IN and AVVECKLA UT directions with append-only change history', () => {
  assert.match(directionMigration, /garage_direction text/);
  assert.match(directionMigration, /in \('IN','UT'\)/i);
  assert.match(directionMigration, /garage_direction_events/);
  assert.match(directionMigration, /append-only/);
  assert.match(directionMigration, /do not rewrite Layer 1 history/);
  assert.match(garageApi, /DIRECTIONS/);
  assert.match(garageApi, /directionChanged/);
  assert.match(garageApi, /garage_direction_events/);
  assert.match(garageUi, /UTVECKLA \/ IN/);
  assert.match(garageUi, /AVVECKLA \/ UT/);
  assert.match(garageUi, /Riktning är planering, inte omskrivning av Lager 1/);
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
