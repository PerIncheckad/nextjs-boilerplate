import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260826014500_add_garage_v2_handoffs.sql', 'utf8');
const lager1Api = readFileSync('app/api/garage/lager1-sources/route.ts', 'utf8');
const handoffApi = readFileSync('app/api/garage/nybil-handoff/route.ts', 'utf8');
const garagePanel = readFileSync('app/garage/garage-v2-panel.tsx', 'utf8');
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

test('Lager 1 can create a Garage disposition without mutating Layer 1', () => {
  assert.match(migration, /'LAGER1'/);
  assert.match(migration, /garage_items_lager1_source_uidx/);
  assert.match(lager1Api, /from\('vehicle_journey_periods'\)/);
  assert.match(lager1Api, /\.is\('ended_at', null\)/);
  assert.match(lager1Api, /source_kind: 'LAGER1'/);
  assert.match(lager1Api, /source_journey_period_id: period\.period_id/);
  assert.match(lager1Api, /source_journey_event_id: period\.source_event_id/);
  assert.doesNotMatch(lager1Api, /from\('vehicle_journey_periods'\)\s*\.update/s);
  assert.doesNotMatch(lager1Api, /from\('vehicle_journey_events'\)\s*\.insert/s);
  assert.match(garagePanel, /Lager 1 behåller verkligheten/);
  assert.match(garagePanel, /Lägg i Garaget/);
});

test('Garage to Ny bil is allowed only for UTVECKLA IN with a real regnr', () => {
  assert.match(handoffApi, /garage_direction !== 'IN'/);
  assert.match(handoffApi, /Registreringsnummer krävs före överlämning till Ny bil/);
  assert.match(garagePanel, /Överlämna till Ny bil/);
  assert.match(garagePanel, /\/nybil\?garage_item_id=/);
});

test('Ny bil carries the exact Garage source and database validates the handoff atomically', () => {
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

test('Ny bil prefill carries known planning facts but does not claim actual receipt location', () => {
  assert.match(nybilPage, /GarageNybilPrefillBridge/);
  assert.match(nybilBridge, /input\.reg-input/);
  assert.match(nybilBridge, /t\.ex\. T-Cross/);
  assert.match(nybilBridge, /Planerad station/);
  assert.match(nybilBridge, /Faktisk mottagningsplats/);
  assert.doesNotMatch(nybilBridge, /setOrt\(/);
  assert.doesNotMatch(nybilBridge, /setStation\(/);
  assert.doesNotMatch(nybilBridge, /Plats för mottagning av ny bil/);
});

test('Garage v2 does not invent ANKOMST or directly create Layer 1 truth', () => {
  for (const source of [lager1Api, handoffApi, garagePanel, nybilBridge, nybilClient]) {
    assert.doesNotMatch(source, /ANKOMMEN/);
    assert.doesNotMatch(source, /transition_vehicle_journey_state/);
  }
  assert.match(garagePanel, /Ny bil-kontrollen gör det när den sparas/);
});
