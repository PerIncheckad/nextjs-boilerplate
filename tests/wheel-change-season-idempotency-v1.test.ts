import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260831201000_lock_wheel_change_once_per_season.sql', 'utf8');
const api = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');

test('seasonal wheel change is permanently unique per vehicle and season', () => {
  assert.match(migration, /create unique index if not exists garage_wheel_changes_one_per_regnr_season_uidx/);
  assert.match(migration, /on public\.garage_wheel_changes \(regnr, season_key\)/);
  assert.match(migration, /where season_key is not null/);
  assert.match(migration, /where regnr = v_regnr\s+and season_key = v_season_key/);
  assert.doesNotMatch(migration, /and status <> 'KLAR'/);
});

test('API hides already handled vehicles for the current season', () => {
  assert.match(api, /const handledThisSeason = new Set/);
  assert.match(api, /item\.season_key === operational\.season\.key/);
  assert.match(api, /!handledThisSeason\.has\(regnr\)/);
});

test('API rejects same-season restart before candidate evaluation', () => {
  assert.match(api, /eq\('season_key', operational\.season\.key\)/);
  assert.match(api, /Hjulskifte finns redan för bilen och säsongen/);
});
