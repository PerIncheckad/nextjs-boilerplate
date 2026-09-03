import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260903224000_add_rented_in_quick_intake_v1.sql', 'utf8');
const api = readFileSync('app/api/vehicle-journey/rented-in-intake/route.ts', 'utf8');
const operational = readFileSync('app/api/vehicle-journey/operational-state/route.ts', 'utf8');
const page = readFileSync('app/garage/page.tsx', 'utf8');
const panel = readFileSync('app/garage/garage-rented-in-intake-panel.tsx', 'utf8');

test('INHYRD intake provenance is immutable and starts at DB intake time only', () => {
  assert.match(migration, /vehicle_rented_in_quick_intakes/);
  assert.match(migration, /object_type text not null check \(object_type = 'INHYRD'\)/);
  assert.match(migration, /v_registered_at timestamptz := clock_timestamp\(\)/);
  assert.match(migration, /historical_backfill boolean not null default false check \(historical_backfill = false\)/);
  assert.match(migration, /reject_vehicle_rented_in_quick_intake_mutation/);
  assert.match(migration, /before update on public\.vehicle_rented_in_quick_intakes/);
  assert.match(migration, /before delete on public\.vehicle_rented_in_quick_intakes/);
});

test('quick intake requires the locked minimum object facts', () => {
  for (const token of ['p_regnr', 'p_brand', 'p_model', 'p_odometer_km', 'p_known_damages']) assert.match(migration, new RegExp(token));
  assert.match(migration, /Known damages must be explicitly recorded, including none known/);
  assert.match(panel, /Märke/);
  assert.match(panel, /Modell/);
  assert.match(panel, /Km/);
  assert.match(panel, /Kända skador/);
});

test('station, intake time, actor and object type are server controlled', () => {
  assert.match(api, /PROTECTED_FIELDS/);
  assert.match(api, /'station'/);
  assert.match(api, /'object_type'/);
  assert.match(api, /'registered_at'/);
  assert.match(api, /resolveStation\(admin, verification\.user\.email\)/);
  assert.match(api, /p_actor_id: verification\.user\.id/);
  assert.match(api, /p_actor_email: verification\.user\.email/);
  assert.match(api, /Active employee station is required for INHYRD quick intake/);
  assert.doesNotMatch(api, /p_registered_at/);
});

test('INHYRD intake cannot fabricate operational Layer 1 or RENTAL truth', () => {
  assert.doesNotMatch(migration, /transition_vehicle_journey_state/);
  assert.doesNotMatch(migration, /insert into public\.vehicle_journey_periods/i);
  assert.doesNotMatch(migration, /insert into public\.rental_operational_facts/i);
  assert.doesNotMatch(api, /rental_operational_facts.*\.(insert|update|delete)/s);
  assert.match(panel, /ingen Layer1-status skapad/);
});

test('INHYRD intake does not write Nybil, Garage, SALU, vehicles or AVVECKLA', () => {
  for (const source of [migration, api]) {
    assert.doesNotMatch(source, /insert into public\.nybil_inventering/i);
    assert.doesNotMatch(source, /insert into public\.garage_items/i);
    assert.doesNotMatch(source, /insert into public\.salu_flags/i);
    assert.doesNotMatch(source, /insert into public\.vehicles/i);
    assert.doesNotMatch(source, /assert_garage_avveckla_ready_for_completion/);
  }
});

test('duplicate INHYRD intake and existing LEGACY classification are blocked', () => {
  assert.match(migration, /unique \(normalized_regnr\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('vehicle-rented-in-quick-intake:' \|\| v_regnr\)\)/);
  assert.match(migration, /INHYRD quick intake already exists for vehicle/);
  assert.match(migration, /Vehicle is already classified as LEGACY_FLEET/);
});

test('operational read model exposes INHYRD classification from immutable intake source', () => {
  assert.match(operational, /vehicle_rented_in_quick_intakes/);
  assert.match(operational, /objectType: 'INHYRD'/);
  assert.match(operational, /objectTypeSource: 'RENTED_IN_QUICK_INTAKE'/);
  assert.match(operational, /objectTypeSourceRecordId: rentedIn\.intake_id/);
  assert.match(operational, /objectTypeStation: rentedIn\.station/);
});

test('Garage exposes INHYRD as a separate surface from Nybil and LEGACY', () => {
  assert.match(page, /GarageRentedInIntakePanel/);
  assert.match(page, /02C \/ INHYRD \/ SNABBINTAG/);
  assert.match(panel, /INHYRD \/ SNABBINTAG/);
  assert.match(panel, /Ingen historik bakåt eller operativ status skapas/);
  assert.doesNotMatch(panel, /GarageLegacyEntryPanel/);
  assert.doesNotMatch(panel, /GarageV2Panel/);
});
