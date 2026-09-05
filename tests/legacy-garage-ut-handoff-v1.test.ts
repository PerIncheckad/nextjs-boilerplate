import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260905001500_add_legacy_garage_ut_handoff_v1.sql', 'utf8');
const api = readFileSync('app/api/garage/legacy-ut-handoff/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-legacy-entry-panel.tsx', 'utf8');
const avveckla = readFileSync('migrations/20260902230000_add_garage_avveckla_foundation_v1.sql', 'utf8');

test('handoff preserves exact immutable LEGACY provenance and current Layer 1 source', () => {
  assert.match(migration, /source_legacy_entry_id uuid/);
  assert.match(migration, /references public\.vehicle_legacy_current_state_entries\(entry_id\)/);
  assert.match(migration, /source_journey_period_id/);
  assert.match(migration, /source_entity = 'vehicle_legacy_current_state_entries'/);
  assert.match(migration, /source_record_id = v_legacy\.entry_id::text/);
  assert.match(migration, /p\.started_at = v_legacy\.verified_at/);
});

test('handoff is current-only and never reconstructs historical truth', () => {
  assert.match(migration, /historical_backfill boolean not null default false check \(historical_backfill = false\)/);
  assert.match(migration, /'historicalBackfill', false/);
  assert.doesNotMatch(migration, /transition_vehicle_journey_state/);
  assert.doesNotMatch(migration, /insert into public\.salu_flags/);
  assert.doesNotMatch(migration, /insert into public\.nybil_inventering/);
  assert.doesNotMatch(migration, /update public\.vehicle_journey_periods/);
});

test('operator must choose an actual active station and cannot inherit old check-in location', () => {
  assert.match(migration, /Aktuell station måste väljas explicit/);
  assert.match(migration, /from public\.planning_stations/);
  assert.match(migration, /station_code = v_station/);
  assert.match(migration, /is_active = true/);
  assert.match(panel, /Faktisk station nu/);
  assert.doesNotMatch(api, /checkins/);
});

test('Garage object is explicitly UT and remains ordinary AVVECKLA input', () => {
  assert.match(migration, /'UT'/);
  assert.match(migration, /'LAGER1'/);
  assert.match(migration, /'ANNAT'/);
  assert.match(migration, /Verifierat LEGACY_FLEET → Garage AVVECKLA \/ UT-handslag/);
  assert.match(panel, /Skapa Garage AVVECKLA \/ UT/);
});

test('duplicate or parallel active Garage materialization is blocked', () => {
  assert.match(migration, /garage_items_active_legacy_source_uidx/);
  assert.match(migration, /Bilen har redan ett aktivt Garage-objekt/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('legacy-garage-ut:' \|\| v_regnr\)\)/);
});

test('handoff provenance is append-only and actor is server derived', () => {
  assert.match(migration, /garage_legacy_handoffs is append-only/);
  assert.match(migration, /before update on public\.garage_legacy_handoffs/);
  assert.match(migration, /before delete on public\.garage_legacy_handoffs/);
  assert.match(api, /verifyApiUser\(request\)/);
  assert.match(api, /p_actor_id: verification\.user\.id/);
  assert.match(api, /p_actor_email: verification\.user\.email/);
});

test('locked AVVECKLA readiness gate is not redesigned or duplicated', () => {
  assert.match(avveckla, /assert_garage_avveckla_ready_for_completion/);
  assert.doesNotMatch(migration, /create or replace function public\.assert_garage_avveckla_ready_for_completion/);
  assert.doesNotMatch(api, /assert_garage_avveckla_ready_for_completion/);
  assert.doesNotMatch(panel, /assert_garage_avveckla_ready_for_completion/);
});
