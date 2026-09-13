import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260912223000_hjulskifte_winter_2026_campaign_scope_v1.sql', 'utf8');
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

test('active scoped campaign gates candidate population and missing wheel facts stay visible', () => {
  assert.match(migration, /from public\.wheel_change_season_scope s/);
  assert.match(migration, /where s\.scope_status = 'IN_SCOPE'/);
  assert.match(migration, /select regnr from scoped_regnrs/);
  assert.match(migration, /where not exists \(select 1 from active_campaign\)/);
  assert.match(migration, /left join lateral public\.get_current_wheel_fact\(u\.regnr\) f on true/);
});

test('existing API safety gates remain in force on top of campaign scope', () => {
  assert.match(api, /readSoldRegnrs/);
  assert.match(api, /readTerminalUtRegnrs/);
  assert.match(api, /handledThisSeason/);
  assert.match(api, /eligibility !== 'REQUIRES_CHANGE'/);
});
