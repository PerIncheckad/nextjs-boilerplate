import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260829123500_add_garage_voiding_v1.sql', 'utf8');
const atomicHandoffMigration = readFileSync('migrations/20260830010000_atomic_planning_garage_handoff.sql', 'utf8');
const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const voidApi = readFileSync('app/api/garage/void/route.ts', 'utf8');
const planningSources = readFileSync('app/api/garage/planning-sources/route.ts', 'utf8');
const lager1Sources = readFileSync('app/api/garage/lager1-sources/route.ts', 'utf8');
const saluSources = readFileSync('app/api/garage/salu-sources/route.ts', 'utf8');
const nybilHandoff = readFileSync('app/api/garage/nybil-handoff/route.ts', 'utf8');
const voidPanel = readFileSync('app/garage/garage-void-panel.tsx', 'utf8');

test('Garage voiding is audited soft removal and never deletes append-only history', () => {
  assert.match(migration, /voided_at/);
  assert.match(migration, /voided_by/);
  assert.match(migration, /void_reason/);
  assert.match(migration, /void_garage_item/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.garage_direction_events/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.garage_items/i);
});

test('Garage voiding refuses objects already handed to Ny bil or with wheel-change history', () => {
  assert.match(migration, /handed_off_nybil_id/);
  assert.match(migration, /source_garage_item_id/);
  assert.match(migration, /garage_wheel_changes/);
});

test('active Garage read models consistently exclude voided objects', () => {
  for (const source of [garageApi, planningSources, lager1Sources, saluSources, nybilHandoff]) {
    assert.match(source, /is\('voided_at', null\)/);
  }
  assert.match(atomicHandoffMigration, /gi\.voided_at is null/);
  assert.match(atomicHandoffMigration, /where source_kind = 'PLANERING' and voided_at is null/);
});

test('void endpoint is authenticated and delegates to the server-only RPC', () => {
  assert.match(voidApi, /verifyApiUser/);
  assert.match(voidApi, /void_garage_item/);
  assert.match(migration, /grant execute on function public\.void_garage_item\(uuid, text, uuid\) to service_role/);
  assert.match(migration, /revoke all on function public\.void_garage_item\(uuid, text, uuid\) from authenticated/);
});

test('Garage UI exposes explicit removal with required reason and confirmation', () => {
  assert.match(voidPanel, /Ta bort från aktiva Garaget/);
  assert.match(voidPanel, /window\.prompt/);
  assert.match(voidPanel, /window\.confirm/);
  assert.match(voidPanel, /\/api\/garage\/void/);
});
