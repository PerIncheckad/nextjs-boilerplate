import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260912223000_hjulskifte_winter_2026_campaign_scope_v1.sql', 'utf8');
const canonicalMigration = readFileSync('migrations/20260914193000_hjulskifte_canonical_fleet_consumer.sql', 'utf8');
const api = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');

test('WINTER_2026 campaign scope is Hjulskifte-only and never deletes vehicle history', () => {
  assert.match(migration, /Operational Hjulskifte campaign control\. Not canonical fleet membership/);
  assert.match(migration, /Rows are retained for traceability; exclusions use scope_status, never vehicle deletion/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(vehicles|nybil_inventering)/i);
  assert.doesNotMatch(migration, /update\s+public\.(vehicles|nybil_inventering)/i);
});

test('WINTER_2026 seed contains exactly 366 unique normalized registration numbers', () => {
  const seedBlock = migration.match(/with seed\(regnr\) as \(\s*values([\s\S]*?)\)\s*insert into public\.wheel_change_season_scope/i)?.[1];
  assert.ok(seedBlock, 'seed block missing');
  const regnrs = Array.from(seedBlock.matchAll(/\('([A-Z0-9]+)'\)/g), (match) => match[1]);
  assert.equal(regnrs.length, 366);
  assert.equal(new Set(regnrs).size, 366);
  for (const regnr of regnrs) assert.equal(regnr, regnr.toUpperCase().replace(/\s+/g, ''));
});

test('historical WINTER_2026 campaign scope remains traceable but is not the current fleet denominator', () => {
  assert.match(migration, /from public\.wheel_change_season_scope s/);
  assert.match(migration, /where s\.scope_status = 'IN_SCOPE'/);
  assert.match(migration, /left join lateral public\.get_current_wheel_fact\(u\.regnr\) f on true/);
  assert.match(canonicalMigration, /fleet_membership_current_by_identity/);
  assert.match(canonicalMigration, /membership_state = 'ACTIVE'/);
  assert.match(canonicalMigration, /resolution_reason = 'RESOLVED'/);
  assert.match(canonicalMigration, /identity_scope = 'OWN_FLEET'/);
  assert.doesNotMatch(canonicalMigration, /wheel_change_season_scope/);
  assert.doesNotMatch(canonicalMigration, /wheel_change_scope_campaigns/);
});

test('current API safety gates consume canonical candidates without sold or terminal membership overrides', () => {
  assert.match(api, /readCandidateSource/);
  assert.doesNotMatch(api, /readSoldRegnrs/);
  assert.doesNotMatch(api, /readTerminalUtRegnrs/);
  assert.match(api, /handledThisSeason/);
  assert.match(api, /eligibility !== 'REQUIRES_CHANGE'/);
});
