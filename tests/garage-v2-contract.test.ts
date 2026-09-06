import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260826014500_add_garage_v2_handoffs.sql', 'utf8');
const lager1Api = readFileSync('app/api/garage/lager1-sources/route.ts', 'utf8');
const handoffApi = readFileSync('app/api/garage/nybil-handoff/route.ts', 'utf8');
const garageStatus = readFileSync('app/garage/garage-nybil-handoff-status-panel.tsx', 'utf8');
const garagePage = readFileSync('app/garage/page.tsx', 'utf8');
const nybilPicker = readFileSync('app/nybil/garage-picker.tsx', 'utf8');
const nybilBridge = readFileSync('app/nybil/garage-prefill-bridge.tsx', 'utf8');
const nybilPage = readFileSync('app/nybil/page.tsx', 'utf8');
const nybilClient = readFileSync('lib/nybil-api-client.ts', 'utf8');

test('Garage v2 keeps regnr as vehicle identity and UUIDs as episode references', () => {
  assert.match(migration, /regnr remains the permanent vehicle identity/i);
  assert.match(migration, /source_journey_period_id uuid/);
  assert.match(migration, /source_journey_event_id uuid/);
  assert.doesNotMatch(migration, /source_vehicle_id/);
  assert.doesNotMatch(lager1Api, /source_vehicle_id/);
});

test('Lager 1 source remains read-only provenance', () => {
  assert.match(migration, /'LAGER1'/);
  assert.match(lager1Api, /export async function GET/);
  assert.doesNotMatch(lager1Api, /export async function POST/);
  assert.doesNotMatch(lager1Api, /from\('vehicle_journey_periods'\)\s*\.update/s);
  assert.doesNotMatch(lager1Api, /from\('vehicle_journey_events'\)\s*\.insert/s);
});

test('Nybil fetches an arrived UTVECKLA IN car from Garage and Garage stays read-only', () => {
  assert.match(handoffApi, /garage_direction !== 'IN'/);
  assert.match(handoffApi, /Registreringsnummer krävs före överlämning till Ny bil/);
  assert.match(nybilPage, /GaragePicker/);
  assert.match(nybilPicker, /Hämta bilen från Garaget/);
  assert.match(nybilPicker, /\/api\/garage\/nybil-handoff/);
  assert.match(nybilPicker, /\/nybil\?garage_item_id=/);
  assert.match(nybilPicker, />Hämta</);
  assert.match(garageStatus, /VÄNTAR PÅ NYBIL/);
  assert.match(garageStatus, /MOTTAGEN I NYBIL/);
  assert.match(garageStatus, /Read-only/);
  assert.doesNotMatch(garageStatus, /\/nybil\?garage_item_id=/);
  assert.doesNotMatch(garageStatus, /method:\s*['\"](?:POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(garagePage, /GarageV2Panel/);
});

test('Nybil carries the exact Garage source and database validates the handoff atomically', () => {
  assert.match(nybilClient, /garage_item_id/);
  assert.match(nybilClient, /source_garage_item_id: garageItemId/);
  assert.match(migration, /source_garage_item_id uuid/);
  assert.match(migration, /sync_nybil_garage_handoff/);
  assert.match(migration, /v_item\.garage_direction <> 'IN'/);
  assert.match(migration, /Garage\/Nybil regnr mismatch/);
  assert.match(migration, /handed_off_nybil_id = new\.id/);
  assert.match(migration, /nybil_inventering_source_garage_uidx/);
});

test('Garage handoff trigger is not exposed as a callable public API', () => {
  assert.match(migration, /revoke all on function public\.sync_nybil_garage_handoff\(\) from public, anon, authenticated/);
  assert.doesNotMatch(migration, /security definer/i);
});

test('Nybil prefill carries known planning facts but does not claim actual receipt location', () => {
  assert.match(nybilPage, /GarageNybilPrefillBridge/);
  assert.match(nybilBridge, /input\.reg-input/);
  assert.match(nybilBridge, /Planerad station/);
  assert.match(nybilBridge, /Faktisk mottagningsplats/);
  assert.match(nybilBridge, /Hämtad från Garaget/);
  assert.match(nybilBridge, /Garaget kvitteras först när Nybil-registreringen sparas/);
  assert.doesNotMatch(nybilBridge, /setOrt\(/);
  assert.doesNotMatch(nybilBridge, /setStation\(/);
});

test('F separation does not invent ANKOMST or directly create Layer 1 truth', () => {
  for (const source of [lager1Api, handoffApi, garageStatus, nybilPicker, nybilBridge, nybilClient]) {
    assert.doesNotMatch(source, /ANKOMMEN/);
    assert.doesNotMatch(source, /transition_vehicle_journey_state/);
  }
  assert.match(garageStatus, /GARAGE → NYBIL/);
  assert.match(nybilPage, /Hämta från Garaget/);
});
