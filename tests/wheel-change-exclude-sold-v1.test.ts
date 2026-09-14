import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const wheelRoute = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const canonicalMigration = readFileSync('migrations/20260914193000_hjulskifte_canonical_fleet_consumer.sql', 'utf8');

test('sold membership is represented by canonical fleet membership, not a parallel Hjulskifte override', () => {
  assert.match(canonicalMigration, /fleet_membership_current_by_identity/);
  assert.match(canonicalMigration, /membership_state = 'ACTIVE'/);
  assert.match(canonicalMigration, /resolution_reason = 'RESOLVED'/);
  assert.match(canonicalMigration, /identity_scope = 'OWN_FLEET'/);
  assert.doesNotMatch(wheelRoute, /readSoldRegnrs/);
  assert.doesNotMatch(wheelRoute, /soldRegnrs/);
  assert.doesNotMatch(wheelRoute, /Bilen är markerad som såld/);
});

test('direct POST rejects vehicles outside canonical candidate population and retains wheel eligibility gate', () => {
  assert.match(wheelRoute, /if \(!candidate\)/);
  assert.match(wheelRoute, /Bilen ingår inte i verifierad canonical fleet population/);
  assert.match(wheelRoute, /eligibility !== 'REQUIRES_CHANGE'/);
  assert.match(wheelRoute, /CANONICAL_ACTIVE_FLEET_WITH_LATEST_VERIFIED_WHEEL_FACT_EXCLUDING_HANDLED_SEASON/);
  assert.doesNotMatch(wheelRoute, /LATEST_VERIFIED_WHEEL_FACT_EXCLUDING_SOLD_TERMINAL_UT_AND_HANDLED_SEASON/);
});
