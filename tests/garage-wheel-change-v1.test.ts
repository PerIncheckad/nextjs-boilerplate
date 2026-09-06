import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260826022500_add_garage_wheel_change_v1.sql', 'utf8');
const api = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const hjulskiftePanel = readFileSync('app/hjulskifte/hjulskifte-panel.tsx', 'utf8');
const hjulskiftePage = readFileSync('app/hjulskifte/page.tsx', 'utf8');
const garagePage = readFileSync('app/garage/page.tsx', 'utf8');
const towerPanel = readFileSync('app/tower/tower-wheel-change-panel.tsx', 'utf8');
const towerClient = readFileSync('app/tower/tower-client.tsx', 'utf8');

test('wheel change remains checkpoint-backed but is operationally owned by Hjulskifte', () => {
  assert.match(migration, /'HJULSKIFTE'/);
  assert.match(migration, /'SERVICE'/);
  assert.match(migration, /'BILKONTROLL'/);
  assert.match(migration, /create table public\.garage_wheel_changes/);
  assert.match(migration, /checkpoint_id uuid not null references public\.vehicle_checkpoints/);
  assert.match(migration, /garage_wheel_changes_one_open_per_item_uidx/);
  assert.match(hjulskiftePage, /active="hjulskifte"/);
  assert.match(hjulskiftePanel, /Systemet hittar behovet\. Du bokar och bekräftar när arbetet är klart\./);
  assert.doesNotMatch(garagePage, /HjulskiftePanel/);
  assert.doesNotMatch(garagePage, /GarageWheelChangePanel/);
});

test('wheel change operational states cover booking, optional legacy execution, completion and deviation', () => {
  for (const status of ['KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE']) {
    assert.match(migration, new RegExp(`'${status}'`));
    assert.match(hjulskiftePanel, new RegExp(status));
  }
  assert.match(migration, /booked_for timestamptz/);
  assert.match(migration, /supplier text/);
  assert.match(migration, /location text/);
  assert.match(migration, /completed_at timestamptz/);
  assert.match(hjulskiftePanel, /Bokad tid/);
  assert.match(hjulskiftePanel, /Leverantör/);
  assert.match(hjulskiftePanel, /Kommentar \/ avvikelse/);
});

test('completion and deviations are verified through the checkpoint engine', () => {
  assert.match(migration, /assess_vehicle_checkpoint/);
  assert.match(migration, /'AVVIKELSE'/);
  assert.match(migration, /'GODKAND'/);
  assert.match(migration, /garage_wheel_change_events/);
  assert.match(migration, /append-only/);
  assert.match(migration, /reject_garage_wheel_change_event_mutation/);
});

test('existing wheel change API remains authenticated and server-only database access', () => {
  assert.match(api, /verifyApiUser/);
  assert.match(api, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(api, /create_garage_wheel_change/);
  assert.match(api, /update_garage_wheel_change/);
  assert.match(migration, /revoke all on public\.garage_wheel_changes from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.create_garage_wheel_change/);
  assert.match(migration, /grant execute on function public\.create_garage_wheel_change/);
});

test('Tower is read-only for wheel change and points operations to Hjulskifte', () => {
  assert.match(towerClient, /TowerWheelChangePanel/);
  assert.match(towerPanel, /Read-only kontrollvy/);
  assert.match(towerPanel, /Öppna Hjulskifte/);
  assert.match(towerPanel, /href="\/hjulskifte"/);
  assert.match(towerPanel, /fetch\('\/api\/garage\/wheel-changes'/);
  assert.doesNotMatch(towerPanel, /method:\s*'POST'/);
  assert.doesNotMatch(towerPanel, /method:\s*'PATCH'/);
});

test('wheel change does not transition or rewrite Layer 1 vehicle state', () => {
  for (const source of [migration, api, hjulskiftePanel, towerPanel]) {
    assert.doesNotMatch(source, /transition_vehicle_journey_state/);
    assert.doesNotMatch(source, /ANKOMMEN/);
    assert.doesNotMatch(source, /vehicle_journey_periods[^\n]*(update|insert)/i);
  }
  assert.match(migration, /does not change the vehicle's Layer 1 state/i);
});
