import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260904011000_add_rented_in_return_v1.sql','utf8');
const api = readFileSync('app/api/vehicle-journey/rented-in-return/route.ts','utf8');
const panel = readFileSync('app/garage/garage-rented-in-return-panel.tsx','utf8');
const page = readFileSync('app/garage/page.tsx','utf8');
const operational = readFileSync('app/api/vehicle-journey/operational-state/route.ts','utf8');

test('INHYRD return provenance is immutable and DB-timed', () => {
  assert.match(migration,/vehicle_rented_in_returns/);
  assert.match(migration,/RETURN_TO_EXTERNAL_PARTY/);
  assert.match(migration,/clock_timestamp\(\)/);
  assert.match(migration,/historical_backfill boolean not null default false/);
  assert.match(migration,/before update on public\.vehicle_rented_in_returns/);
  assert.match(migration,/before delete on public\.vehicle_rented_in_returns/);
});

test('return requires real intake, nondecreasing km and exact return facts', () => {
  assert.match(migration,/Active INHYRD intake not found/);
  assert.match(migration,/Return odometer cannot be lower than intake odometer/);
  for (const token of ['p_return_station','p_returned_to','p_odometer_km','p_damages_at_return','p_energy_type','p_energy_level_percent']) assert.match(migration,new RegExp(token));
});

test('return cannot terminate source-owned operational state', () => {
  assert.match(migration,/Open Layer 1 period must be closed by its owning source before INHYRD return/);
  assert.doesNotMatch(migration,/transition_vehicle_journey_state/);
  assert.doesNotMatch(migration,/close_rental_period_from_source/);
  assert.doesNotMatch(migration,/update public\.rental_operational_facts/i);
  assert.doesNotMatch(api,/rental_operational_facts.*\.(insert|update|delete)/s);
  assert.match(panel,/RENTAL och AVVECKLA ägs av sina egna flöden/);
});

test('return does not use ordinary AVVECKLA readiness or mutate other modules', () => {
  for (const source of [migration,api]) {
    assert.doesNotMatch(source,/assert_garage_avveckla_ready_for_completion/);
    assert.doesNotMatch(source,/insert into public\.garage_/i);
    assert.doesNotMatch(source,/insert into public\.salu_flags/i);
    assert.doesNotMatch(source,/insert into public\.nybil_inventering/i);
    assert.doesNotMatch(source,/insert into public\.vehicles/i);
  }
});

test('station remains authorization scoped and return station is server validated', () => {
  assert.match(api,/HUVUDSTATIONER/);
  assert.match(api,/station_scope/);
  assert.match(api,/Valid return station is required/);
  assert.match(api,/Return station is server-controlled for single-station operators/);
  assert.doesNotMatch(api,/p_returned_at/);
});

test('Garage exposes INHYRD return separately from ordinary AVVECKLA', () => {
  assert.match(page,/GarageRentedInReturnPanel/);
  assert.match(page,/02D \/ INHYRD \/ ÅTERLÄMNING/);
  assert.match(panel,/INHYRD \/ ÅTERLÄMNING/);
  assert.doesNotMatch(panel,/GarageAvvecklaPanel/);
});

test('operational read model marks returned INHYRD as historical returned object', () => {
  assert.match(operational,/vehicle_rented_in_returns/);
  assert.match(operational,/objectType: 'INHYRD_RETURNED'/);
  assert.match(operational,/objectTypeSource: 'RENTED_IN_RETURN'/);
  assert.match(operational,/rentedIn && !rentedInReturn/);
});
