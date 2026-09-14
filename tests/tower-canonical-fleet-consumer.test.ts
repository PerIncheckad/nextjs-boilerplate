import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync('app/api/tower/read-model/route.ts', 'utf8');
const cockpit = readFileSync('app/tower/tower-cockpit-v2.tsx', 'utf8');

test('Tower fleet.active consumes only canonical membership current state', () => {
  assert.match(route, /from\('fleet_membership_current_by_identity'\)/);
  assert.match(route, /eq\('membership_state', 'ACTIVE'\)/);
  assert.match(route, /eq\('resolution_reason', 'RESOLVED'\)/);
  assert.match(route, /active: fleetMembershipVerified \? canonicalActiveCount : null/);
  assert.doesNotMatch(route, /from\('vehicles'\)/);
  assert.doesNotMatch(route, /from\('checkins'\)/);
  assert.doesNotMatch(route, /from\('nybil_inventering'\)/);
});

test('Tower canonical source health requires an applied complete OWN_FLEET baseline', () => {
  assert.match(route, /from\('fleet_membership_bootstrap_batch_status'\)/);
  assert.match(route, /eq\('scope', 'OWN_FLEET'\)/);
  assert.match(route, /eq\('coverage_mode', 'COMPLETE_ACTIVE_POPULATION'\)/);
  assert.match(route, /eq\('complete_active_population_attested', true\)/);
  assert.match(route, /eq\('bootstrap_denominator_eligible', true\)/);
  assert.match(route, /not\('application_id', 'is', null\)/);
  assert.match(route, /health: 'VERIFIED'/);
});

test('Tower does not expose canonical membership writers', () => {
  assert.doesNotMatch(route, /append_fleet_membership_fact/);
  assert.doesNotMatch(route, /create_fleet_vehicle_identity/);
  assert.doesNotMatch(route, /bind_fleet_vehicle_identity_alias/);
  assert.doesNotMatch(route, /apply_fleet_membership_bootstrap_batch/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.delete\(/);
});

test('Hjulskifte canonical candidate population remains blocked in Tower cutover', () => {
  assert.match(route, /canonicalCandidateCount: null/);
  assert.match(route, /separate Hjulskifte consumer cutover/);
  assert.match(cockpit, /separat Hjulskifte consumer cutover/);
});

test('Tower presentation no longer claims the canonical baseline is missing', () => {
  assert.doesNotMatch(cockpit, /Verifierad baseline', 'Saknas'/);
  assert.doesNotMatch(cockpit, /innan AKTIVA-baseline finns/);
  assert.match(cockpit, /Canonical membership/);
});
