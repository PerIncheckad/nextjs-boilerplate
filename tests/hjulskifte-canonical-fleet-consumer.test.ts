import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260914193000_hjulskifte_canonical_fleet_consumer.sql', 'utf8');
const route = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const wheelTruth = readFileSync('migrations/20260906011000_hjulskifte_completed_current_wheel_fact.sql', 'utf8');

test('Hjulskifte denominator is canonical ACTIVE OWN_FLEET with verified bootstrap gate', () => {
  assert.match(migration, /fleet_membership_current_by_identity/);
  assert.match(migration, /membership_state = 'ACTIVE'/);
  assert.match(migration, /resolution_reason = 'RESOLVED'/);
  assert.match(migration, /identity_scope = 'OWN_FLEET'/);
  assert.match(migration, /coverage_mode = 'COMPLETE_ACTIVE_POPULATION'/);
  assert.match(migration, /verified = true/);
  assert.match(migration, /complete_active_population_attested = true/);
  assert.match(migration, /application_id is not null/);
  assert.match(migration, /bootstrap_denominator_eligible = true/);
  assert.match(migration, /unresolved_count = 0/);
  assert.doesNotMatch(migration, /consumer_cutover_ready/);
});

test('Hjulskifte has no historical or campaign membership fallback', () => {
  assert.doesNotMatch(migration, /wheel_change_season_scope/);
  assert.doesNotMatch(migration, /wheel_change_scope_campaigns/);
  assert.doesNotMatch(migration, /fallback_regnrs/);
  assert.doesNotMatch(migration, /select regnr from latest_checkin\s+union/i);
  assert.doesNotMatch(migration, /select regnr from latest_nybil\s+union/i);
});

test('Check-in, Nybil and SALU remain enrichment or wheel truth only', () => {
  assert.match(migration, /left join latest_checkin/);
  assert.match(migration, /left join latest_nybil/);
  assert.match(migration, /left join public\.salu_vehicle_state/);
  assert.match(migration, /get_current_wheel_fact/);
  assert.doesNotMatch(migration, /create or replace function public\.get_current_wheel_fact/);
});

test('API has no sold or terminal membership override and no legacy Garage create bypass', () => {
  assert.doesNotMatch(route, /readSoldRegnrs/);
  assert.doesNotMatch(route, /readTerminalUtRegnrs/);
  assert.doesNotMatch(route, /create_garage_wheel_change'/);
  assert.match(route, /handledThisSeason/);
  assert.match(route, /readCandidateSource/);
  assert.match(route, /eligibility !== 'REQUIRES_CHANGE'/);
});

test('existing wheel truth precedence remains locked in prior migration', () => {
  assert.match(wheelTruth, /'HJULSKIFTE'::text[\s\S]*4 as source_rank/);
  assert.match(wheelTruth, /'STATUS'[\s\S]*3/);
  assert.match(wheelTruth, /'CHECKIN'[\s\S]*2/);
  assert.match(wheelTruth, /'NYBIL'[\s\S]*1/);
  assert.match(wheelTruth, /order by s\.verified_at desc nulls last, s\.source_rank desc/);
});
