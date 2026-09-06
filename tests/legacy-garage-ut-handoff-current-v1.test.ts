import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260906031500_add_legacy_garage_ut_handoff_current_v1.sql', 'utf8');
const api = readFileSync('app/api/garage/legacy-ut-handoff/route.ts', 'utf8');
const panel = readFileSync('app/legacy/legacy-current-state-panel.tsx', 'utf8');
const legacyPage = readFileSync('app/legacy/page.tsx', 'utf8');
const garagePage = readFileSync('app/garage/page.tsx', 'utf8');
const avvecklaFoundation = readFileSync('migrations/20260902230000_add_garage_avveckla_foundation_v1.sql', 'utf8');

test('exact immutable LEGACY provenance authorizes one Garage UT work object', () => {
  assert.match(migration, /source_legacy_entry_id uuid/);
  assert.match(migration, /references public\.vehicle_legacy_current_state_entries\(entry_id\)/);
  assert.match(migration, /source_kind = 'LAGER1'/);
  assert.match(migration, /source_journey_period_id is not null/);
  assert.match(migration, /source_entity = 'vehicle_legacy_current_state_entries'/);
  assert.match(migration, /source_record_id = v_legacy\.entry_id::text/);
  assert.match(migration, /p\.started_at = v_legacy\.verified_at/);
  assert.match(migration, /garage_direction = 'UT'/);
});

test('handoff is current-only and cannot reconstruct or rewrite history', () => {
  assert.match(migration, /historical_backfill boolean not null default false check \(historical_backfill = false\)/);
  assert.match(migration, /'historicalBackfill', false/);
  assert.doesNotMatch(migration, /transition_vehicle_journey_state/);
  assert.doesNotMatch(migration, /update public\.vehicle_journey_periods/);
  assert.doesNotMatch(migration, /insert into public\.salu_flags/);
  assert.doesNotMatch(migration, /insert into public\.nybil_inventering/);
});

test('Garage work station is explicit and is not current physical location', () => {
  assert.match(migration, /Garage-station för avvecklingsarbetet måste väljas explicit/);
  assert.match(migration, /from public\.planning_stations/);
  assert.match(migration, /station_code = v_station/);
  assert.match(migration, /is_active = true/);
  assert.match(panel, /Garage-station för avvecklingsarbetet/);
  assert.match(panel, /ändrar inte bilens current physical location/);
  for (const source of [migration, api]) {
    assert.doesNotMatch(source, /current_location/);
    assert.doesNotMatch(source, /vehicle_edits/);
    assert.doesNotMatch(source, /checkins/);
  }
});

test('model description never becomes ownership or current-state proof', () => {
  assert.match(migration, /v_snapshot_model/);
  assert.match(migration, /v_model_source := 'LEGACY_SNAPSHOT'/);
  assert.match(migration, /v_model_source := 'MANUELL'/);
  assert.match(migration, /Modell\/beskrivning krävs när LEGACY-snapshot saknar modell/);
  assert.match(panel, /Krävs endast för Garage-arbetsobjektet/);
  assert.match(panel, /Vehicle-katalogen är endast kontrollbild/);
  assert.doesNotMatch(migration, /from public\.vehicles/);
  assert.doesNotMatch(api, /from\('vehicles'\)/);
});

test('duplicates and parallel Garage work are blocked', () => {
  assert.match(migration, /garage_items_legacy_source_once_uidx/);
  assert.match(migration, /unique \(legacy_entry_id\)/);
  assert.match(migration, /Bilen har redan ett aktivt Garage-objekt/);
  assert.match(migration, /LEGACY-entryn är redan överlämnad till Garage/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('legacy-garage-ut:' \|\| v_regnr\)\)/);
});

test('handoff provenance is append-only and actor is authenticated server-side', () => {
  assert.match(migration, /garage_legacy_handoffs is append-only/);
  assert.match(migration, /before update on public\.garage_legacy_handoffs/);
  assert.match(migration, /before delete on public\.garage_legacy_handoffs/);
  assert.match(api, /verifyApiUser\(request\)/);
  assert.match(api, /p_actor_id: verification\.user\.id/);
  assert.match(api, /p_actor_email: verification\.user\.email/);
});

test('Garage UT handoff remains on #575 but can only be initiated from LEGACY module UI', () => {
  assert.match(legacyPage, /02 \/ ÖVERLÄMNA TILL GARAGE UT/);
  assert.match(panel, /\/api\/garage\/legacy-ut-handoff/);
  assert.match(migration, /'avvecklaStarted', false/);
  assert.match(api, /avvecklaStarted: false/);
  assert.match(panel, /startar inte AVVECKLA/);
  assert.match(panel, /AVVECKLA: inte startad av handslaget/);
  assert.match(avvecklaFoundation, /assert_garage_avveckla_ready_for_completion/);
  assert.doesNotMatch(garagePage, /legacy-ut-handoff/);
  assert.doesNotMatch(garagePage, /LEGACY_FLEET/);
  for (const source of [migration, api, panel]) {
    assert.doesNotMatch(source, /start_garage_avveckla_case\s*\(/);
    assert.doesNotMatch(source, /complete_garage_avveckla_ut_internal\s*\(/);
    assert.doesNotMatch(source, /create or replace function public\.assert_garage_avveckla_ready_for_completion/);
  }
});
