import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const route = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const canonicalMigration = readFileSync('migrations/20260914193000_hjulskifte_canonical_fleet_consumer.sql', 'utf8');

test('terminal EXIT is not redefined by the Hjulskifte membership consumer', () => {
  assert.match(canonicalMigration, /fleet_membership_current_by_identity/);
  assert.match(canonicalMigration, /membership_state = 'ACTIVE'/);
  assert.match(canonicalMigration, /resolution_reason = 'RESOLVED'/);
  assert.match(canonicalMigration, /identity_scope = 'OWN_FLEET'/);
  assert.doesNotMatch(route, /readTerminalUtRegnrs/);
  assert.doesNotMatch(route, /garage_avveckla_events/);
  assert.doesNotMatch(route, /UT_OVERLAMNING_VERIFIERAD/);
});

test('Hjulskifte reads canonical candidates instead of a parallel AVVECKLA membership path', () => {
  assert.match(route, /admin\.rpc\('get_wheel_change_candidate_source'\)/);
  assert.doesNotMatch(route, /garage_avveckla_cases!garage_avveckla_events_avveckla_case_id_fkey/);
  assert.doesNotMatch(route, /garage_avveckla_cases_completion_event_fkey/);
});
