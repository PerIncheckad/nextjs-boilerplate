import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260825201500_add_planning_and_garage_v1.sql', 'utf8');
const modelMigration = readFileSync('migrations/20260825205500_add_planning_vehicle_models_v1.sql', 'utf8');
const directionMigration = readFileSync('migrations/20260825211000_add_garage_direction_v1.sql', 'utf8');
const finalMigration = readFileSync('migrations/20260825213500_finalize_planning_garage_v1.sql', 'utf8');
const atomicHandoffMigration = readFileSync('migrations/20260830010000_atomic_planning_garage_handoff.sql', 'utf8');
const hMigration = readFileSync('migrations/20260906163000_garage_information_continuity_h_v1.sql', 'utf8');
const planningApi = readFileSync('app/api/fleet-planning/route.ts', 'utf8');
const planningModelApi = readFileSync('app/api/planning/models/route.ts', 'utf8');
const planningStatusApi = readFileSync('app/api/planning/period-status/route.ts', 'utf8');
const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const planningSourceApi = readFileSync('app/api/garage/planning-sources/route.ts', 'utf8');
const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');
const garageUi = readFileSync('app/garage/garage-client.tsx', 'utf8');
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

test('planning retains stored cell fields but BEHOV is no longer an active planning decision', () => {
  for (const field of ['salu_count', 'behov_count', 'utok_count', 'minskning_count', 'ordered_count']) {
    assert.match(migration, new RegExp(field));
    assert.match(planningApi, new RegExp(field));
  }
  assert.doesNotMatch(planningUi, /\['behov_count', 'BEHOV'\]/);
  assert.match(planningUi, /UTÖKNING/);
  assert.match(planningUi, /MINSKNING/);
  assert.match(planningUi, /BESTÄLLT/);
  assert.match(planningUi, /SALU är beslutsstöd/);
  assert.doesNotMatch(planningUi, /\['salu_count',\s*'SALU'\]/);
});

test('planning is monthly and retains direct keyboard work in the matrix', () => {
  assert.match(planningApi, /MONTH_RE/);
  assert.match(planningUi, /type="month"/);
  assert.match(planningUi, /defaultPeriod/);
  assert.match(planningUi, /toISOString\(\)\.slice\(0, 7\)/);
  assert.match(planningUi, /moveFocus/);
  assert.match(planningUi, /data-planning-cell/);
});

test('planning uses stable model identity and exposes editable masterdata through authenticated API', () => {
  assert.match(modelMigration, /create table if not exists public\.planning_vehicle_models/);
  assert.match(modelMigration, /model_code text primary key/);
  assert.match(planningApi, /from\('planning_vehicle_models'\)/);
  assert.match(planningApi, /model_code/);
  assert.match(planningModelApi, /verifyApiUser/);
  assert.match(planningModelApi, /display_name/);
  assert.match(planningModelApi, /is_electric/);
  assert.match(planningModelApi, /is_automatic/);
  assert.match(planningModelApi, /daily_rate/);
  assert.match(planningUi, /modelNameInput/);
  assert.match(garageApi, /from\('planning_vehicle_models'\)/);
  assert.match(garageUi, /garage-models/);
  assert.match(garageUi, /Välj eller skriv modell/);
});

test('planning and Garage writes stay behind authenticated server APIs and service role', () => {
  for (const api of [planningApi, planningModelApi, planningStatusApi, garageApi, planningSourceApi]) {
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

test('KLAR materializes BESTALLT automatically without duplicate units', () => {
  assert.match(finalMigration, /source_kind.*PLANERING/s);
  assert.match(finalMigration, /garage_items_planning_source_uidx/);
  assert.match(planningStatusApi, /admin\.rpc\('finalize_planning_period_to_garage'/);
  assert.match(atomicHandoffMigration, /source_planning_unit_no/);
  assert.match(atomicHandoffMigration, /'PLANERING'/);
  assert.match(atomicHandoffMigration, /'IN'/);
  assert.match(atomicHandoffMigration, /planning_vehicle_models/);
  assert.match(atomicHandoffMigration, /daily_rate/);
  assert.match(hMigration, /create or replace function public\.finalize_planning_period_to_garage/);
  assert.match(hMigration, /'BEKRAFTAD'/);
  assert.doesNotMatch(hMigration, /v_calloff_date/);
  assert.doesNotMatch(hMigration, /Europe\/Stockholm/);
  assert.match(hMigration, /voided_at is null/);
  assert.doesNotMatch(garageUi, /Hämta från Planering/);
  assert.match(garageUi, /redan beställd, avropad och bekräftad/);
});

test('Garage does not expose legacy manual SALU ingress', () => {
  assert.doesNotMatch(garageUi, /Hämta från SALU/);
  assert.doesNotMatch(garageUi, /\/api\/garage\/salu-sources/);
});

test('Garage IN supports current information completion without order workflow UI', () => {
  for (const field of ['regnr', 'returadress', 'daily_rate', 'planned_delivery_date']) assert.match(garageApi, new RegExp(field));
  assert.match(garageUi, /Returadress/);
  assert.match(garageUi, /Förväntad ankomst/);
  assert.match(garageUi, /Dygnsdeb/);
  assert.match(garageUi, /Reg\.nr/);
  assert.doesNotMatch(garageUi, /Field label="Beställd"/);
  assert.doesNotMatch(garageUi, /Field label="Avropad"/);
  assert.doesNotMatch(garageUi, /Field label="Bekräftelse"/);
  assert.doesNotMatch(garageUi, /Field label="Transport"/);
  assert.match(garageUi, /Sortera/);
  assert.match(garageUi, /Skriv ut/);
  assert.match(garageUi, />PDF</);
  assert.match(garageCss, /@media print/);
});

test('Garage transport does not manually claim actual Layer 1 arrival', () => {
  assert.match(finalMigration, /Actual ANKOMST is Layer 1/);
  assert.doesNotMatch(garageApi, /'ANKOMMEN'/);
  assert.doesNotMatch(garageUi, /<option>ANKOMMEN<\/option>/);
  assert.match(garageUi, /Förväntad ankomst/);
});

test('Garage daily rate remains vehicle-specific current information after H', () => {
  assert.match(migration, /daily_rate numeric/);
  assert.match(hMigration, /Garage daily_rate is vehicle-specific current information/);
  const hDefaults = hMigration.match(/create or replace function public\.apply_first_garage_model_defaults\(\)[\s\S]*?\n\$\$;/)?.[0] ?? '';
  assert.doesNotMatch(hDefaults, /set daily_rate = new\.daily_rate/);
  assert.doesNotMatch(hDefaults, /gi\.daily_rate is null/);
  assert.match(garageUi, /Dygnsdeb/);
});
