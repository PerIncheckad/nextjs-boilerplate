import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260825201500_add_planning_and_garage_v1.sql', 'utf8');
const modelMigration = readFileSync('migrations/20260825205500_add_planning_vehicle_models_v1.sql', 'utf8');
const directionMigration = readFileSync('migrations/20260825211000_add_garage_direction_v1.sql', 'utf8');
const finalMigration = readFileSync('migrations/20260825213500_finalize_planning_garage_v1.sql', 'utf8');
const planningApi = readFileSync('app/api/fleet-planning/route.ts', 'utf8');
const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const planningSourceApi = readFileSync('app/api/garage/planning-sources/route.ts', 'utf8');
const saluSourceApi = readFileSync('app/api/garage/salu-sources/route.ts', 'utf8');
const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');
const garageUi = readFileSync('app/garage/garage-client.tsx', 'utf8');
const planningCss = readFileSync('app/planning/planning.module.css', 'utf8');
const garageCss = readFileSync('app/garage/garage.module.css', 'utf8');

test('planning starts with 166, 170 and 274 but station growth is configuration, not code', () => {
  assert.match(migration, /create table if not exists public\.planning_stations/);
  for (const station of ['166', '170', '274']) assert.match(migration, new RegExp(`\\('${station}'`));
  assert.match(migration, /references public\.planning_stations\(station_code\)/);
  assert.match(planningApi, /from\('planning_stations'\)/);
  assert.match(garageApi, /from\('planning_stations'\)/);
  assert.doesNotMatch(planningUi, /const STATIONS/);
  assert.doesNotMatch(garageUi, /const STATIONS/);
});

test('planning keeps SALU BEHOV UTOK MINSKNING and BESTALLT separate without inventing a formula', () => {
  for (const field of ['salu_count', 'behov_count', 'utok_count', 'minskning_count', 'ordered_count']) {
    assert.match(migration, new RegExp(field));
    assert.match(planningApi, new RegExp(field));
    assert.match(planningUi, new RegExp(field));
  }
  assert.match(planningUi, /SALU/);
  assert.match(planningUi, /BEHOV/);
  assert.match(planningUi, /UTÖKNING/);
  assert.match(planningUi, /MINSKNING/);
  assert.match(planningUi, /BESTÄLLT/);
});

test('planning is monthly and retains Excel-like direct work', () => {
  assert.match(planningApi, /MONTH_RE/);
  assert.match(planningUi, /type="month"/);
  assert.match(planningUi, /defaultPeriod/);
  assert.match(planningUi, /toISOString\(\)\.slice\(0, 7\)/);
  assert.match(planningUi, /pasteSheet/);
  assert.match(planningUi, /data-sheet-cell/);
  assert.match(planningCss, /position:sticky/);
  assert.match(planningUi, /window\.print/);
  assert.match(planningUi, />PDF</);
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

test('planning and Garage writes stay behind authenticated server APIs and service role', () => {
  for (const api of [planningApi, garageApi, planningSourceApi, saluSourceApi]) {
    assert.match(api, /verifyApiUser/);
    assert.match(api, /SUPABASE_SERVICE_ROLE_KEY/);
  }
  assert.match(modelMigration, /revoke all on public\.planning_vehicle_models from anon, authenticated/);
  assert.match(directionMigration, /revoke all on public\.garage_direction_events from anon, authenticated/);
  assert.match(migration, /revoke all on public\.planning_stations from anon, authenticated/);
  assert.match(migration, /revoke all on public\.fleet_planning_cells from anon, authenticated/);
  assert.match(migration, /revoke all on public\.garage_items from anon, authenticated/);
});

test('Garage has explicit UTVECKLA IN and AVVECKLA UT with append-only direction history', () => {
  assert.match(directionMigration, /garage_direction text/);
  assert.match(directionMigration, /garage_direction_events/);
  assert.match(directionMigration, /append-only/);
  assert.match(directionMigration, /do not rewrite Layer 1 history/);
  assert.match(garageApi, /change_garage_direction/);
  assert.match(finalMigration, /change_garage_direction/);
  assert.match(garageUi, /UTVECKLA \/ IN/);
  assert.match(garageUi, /AVVECKLA \/ UT/);
});

test('Garage station replanning is atomic and audited', () => {
  assert.match(finalMigration, /create or replace function public\.replan_garage_station/);
  assert.match(finalMigration, /garage_station_events/);
  assert.match(garageApi, /replan_garage_station/);
  assert.match(garageUi, /Omplanerad i Garaget/);
});

test('Garage can materialize BESTALLT from Planering without duplicate units', () => {
  assert.match(finalMigration, /source_kind.*PLANERING/s);
  assert.match(finalMigration, /garage_items_planning_source_uidx/);
  assert.match(planningSourceApi, /ordered_count/);
  assert.match(planningSourceApi, /source_planning_unit_no/);
  assert.match(planningSourceApi, /remaining_count/);
  assert.match(garageUi, /Hämta från Planering/);
  assert.match(garageUi, /BESTÄLLT blir individuella Garage-objekt/);
});

test('Garage can import one exact SALU cycle once without rewriting Layer 1', () => {
  assert.match(finalMigration, /source_salu_flag_id/);
  assert.match(finalMigration, /garage_items_salu_source_uidx/);
  assert.match(saluSourceApi, /from\('salu_flags'\)/);
  assert.match(saluSourceApi, /source_salu_flag_id/);
  assert.match(saluSourceApi, /planning_reason: 'SALU'/);
  assert.match(garageUi, /Hämta från SALU/);
  assert.match(garageUi, /Exakt SALU-cykel kan bara hämtas en gång/);
});

test('Garage supports full operational editing, sorting, print and PDF', () => {
  for (const field of ['source_regnr', 'saluort', 'daily_rate', 'ordered_at', 'calloff_at', 'planned_delivery_date']) assert.match(garageApi, new RegExp(field));
  assert.match(garageUi, /Sortera/);
  assert.match(garageUi, /Skriv ut/);
  assert.match(garageUi, />PDF</);
  assert.match(garageUi, /Källreg\.nr/);
  assert.match(garageUi, /Beställd/);
  assert.match(garageUi, /Avropad/);
  assert.match(garageCss, /@media print/);
});

test('Garage transport does not manually claim actual Layer 1 arrival', () => {
  assert.match(finalMigration, /Actual ANKOMST is Layer 1/);
  assert.doesNotMatch(garageApi, /'ANKOMMEN'/);
  assert.doesNotMatch(garageUi, /<option>ANKOMMEN<\/option>/);
});

test('Garage planned money fields remain planning facts, not Kistan monetary outcome', () => {
  assert.match(migration, /daily_rate numeric/);
  assert.match(migration, /Not verified monetary consequence and not Kistan output/);
  assert.match(garageUi, /Dygnsdebitering/);
});
