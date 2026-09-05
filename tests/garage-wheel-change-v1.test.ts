import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260826022500_add_garage_wheel_change_v1.sql', 'utf8');
const api = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const garagePanel = readFileSync('app/garage/garage-wheel-change-panel.tsx', 'utf8');
const garagePage = readFileSync('app/garage/page.tsx', 'utf8');
const towerPanel = readFileSync('app/tower/tower-wheel-change-panel.tsx', 'utf8');
const towerClient = readFileSync('app/tower/tower-client.tsx', 'utf8');

test('wheel change is an operational Garage workflow backed by an L2 checkpoint', () => {
  assert.match(migration, /'HJULSKIFTE'/);
  assert.match(migration, /'SERVICE'/);
  assert.match(migration, /'BILKONTROLL'/);
  assert.match(migration, /create table public\.garage_wheel_changes/);
  assert.match(migration, /checkpoint_id uuid not null references public\.vehicle_checkpoints/);
  assert.match(migration, /garage_wheel_changes_one_open_per_item_uidx/);
  assert.match(garagePage, /GarageWheelChangePanel/);
  assert.match(garagePanel, /Systemet hittar behovet\. Du bokar och bekräftar när arbetet är klart\./);
});

test('wheel change operational states cover booking, optional legacy execution, completion and deviation', () => {
  for (const status of ['KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE']) {
    assert.match(migration, new RegExp(`'${status}'`));
    assert.match(garagePanel, new RegExp(status));
  }
  assert.match(migration, /booked_for timestamptz/);
  assert.match(migration, /supplier text/);
  assert.match(migration, /location text/);
  assert.match(migration, /completed_at timestamptz/);
  assert.match(garagePanel, /Bokad tid/);
  assert.match(garagePanel, /Leverantör/);
  assert.match(garagePanel, /Kommentar \/ avvikelse/);
});

test('completion and deviations are verified through the checkpoint engine', () => {
  assert.match(migration, /assess_vehicle_checkpoint/);
  assert.match(migration, /'AVVIKELSE'/);
  assert.match(migration, /'GODKAND'/);
  assert.match(migration, /garage_wheel_change_events/);
  assert.match(migration, /append-only/);
  assert.match(migration, /reject_garage_wheel_change_event_mutation/);
});

test('Garage wheel change API is authenticated and server-only database access', () => {
  assert.match(api, /verifyApiUser/);
  assert.match(api, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(api, /create_garage_wheel_change/);
  assert.match(api, /update_garage_wheel_change/);
  assert.match(migration, /revoke all on public\.garage_wheel_changes from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.create_garage_wheel_change/);
  assert.match(migration, /grant execute on function public\.create_garage_wheel_change/);
});

test('Tower is read-only for wheel change and points operations back to Garage', () => {
  assert.match(towerClient, /TowerWheelChangePanel/);
  assert.match(towerPanel, /Read-only kontrollvy/);
  assert.match(towerPanel, /Öppna Garaget/);
  assert.match(towerPanel, /fetch\('\/api\/garage\/wheel-changes'/);
  assert.doesNotMatch(towerPanel, /method:\s*'POST'/);
  assert.doesNotMatch(towerPanel, /method:\s*'PATCH'/);
});

test('wheel change does not transition or rewrite Layer 1 vehicle state', () => {
  for (const source of [migration, api, garagePanel, towerPanel]) {
    assert.doesNotMatch(source, /transition_vehicle_journey_state/);
    assert.doesNotMatch(source, /ANKOMMEN/);
    assert.doesNotMatch(source, /vehicle_journey_periods[^\n]*(update|insert)/i);
  }
  assert.match(migration, /does not change the vehicle's Layer 1 state/i);
});
