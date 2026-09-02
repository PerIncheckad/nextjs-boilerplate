import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const overviewApi = readFileSync('app/api/garage/overview/route.ts', 'utf8');
const migration = readFileSync('migrations/20260902002000_freeze_garage_after_nybil_handoff.sql', 'utf8');

test('active Garage excludes exactly Nybil-handed-off objects', () => {
  assert.match(garageApi, /is\('handed_off_nybil_id', null\)/);
  assert.match(overviewApi, /is\('handed_off_nybil_id', null\)/);
});

test('Garage PATCH refuses an acknowledged Nybil handoff', () => {
  assert.match(garageApi, /select\('garage_item_id,handed_off_nybil_id,completed_at'\)/);
  assert.match(garageApi, /Garage-objektet är mottaget i Ny bil och är fryst/);
  assert.match(garageApi, /status: 409/);
});

test('database freezes Garage after exact Nybil acknowledgement', () => {
  assert.match(migration, /guard_garage_item_nybil_handoff_freeze/);
  assert.match(migration, /old\.handed_off_nybil_id is not null and new is distinct from old/);
  assert.match(migration, /pg_trigger_depth\(\) <= 1/);
  assert.match(migration, /Ny bil-kvittensen får inte ändra Garage-fakta/);
});

test('model defaults only propagate to objects still active in Garage', () => {
  const matches = migration.match(/handed_off_nybil_id is null/g) ?? [];
  assert.ok(matches.length >= 4);
});
