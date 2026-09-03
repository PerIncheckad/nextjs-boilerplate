import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveBrandPrefill, resolvePlannedStationName } from '../lib/nybil-garage-prefill';

const handoffApi = readFileSync('app/api/garage/nybil-handoff/route.ts', 'utf8');
const handoffClient = readFileSync('lib/garage-nybil-handoff-client.ts', 'utf8');
const upstreamUi = readFileSync('app/nybil/garage-upstream-context.tsx', 'utf8');
const prefillBridge = readFileSync('app/nybil/garage-prefill-bridge.tsx', 'utf8');
const nybilClient = readFileSync('lib/nybil-api-client.ts', 'utf8');
const nybilApi = readFileSync('app/api/nybil/route.ts', 'utf8');
const nybilPage = readFileSync('app/nybil/page.tsx', 'utf8');
const nybilFormGate = readFileSync('app/nybil/form-gate.tsx', 'utf8');
const migration = readFileSync('migrations/20260902112000_nybil_upstream_information_continuity.sql', 'utf8');

const carriedFields = [
  'planning_period',
  'planning_reason',
  'supplier',
  'order_reference',
  'vin',
  'source_regnr',
  'saluort',
  'daily_rate',
  'holding_period_months',
  'ordered_at',
  'calloff_at',
  'confirmation_status',
  'transport_status',
  'planned_delivery_date',
];

test('Garage handoff exposes the upstream facts Nybil must carry', () => {
  for (const field of carriedFields) assert.match(handoffApi, new RegExp(field));
  assert.match(handoffApi, /source_planning_cell_id/);
  assert.match(handoffApi, /planning_vehicle_models/);
  assert.match(handoffApi, /brand,is_electric,is_automatic/);
  assert.match(handoffApi, /updated_at/);
});

test('Nybil renders upstream facts as editable receipt context', () => {
  for (const field of carriedFields) assert.match(upstreamUi, new RegExp(field));
  assert.match(upstreamUi, /Garage-källan skrivs inte om/);
  assert.match(upstreamUi, /ändrade värden/);
});

test('ordinary Nybil fields remain editable and override carried defaults on save', () => {
  assert.match(prefillBridge, /Bilmärke/);
  assert.match(prefillBridge, /Reg\.nr, bilmärke, modell och planerad station förifylls/);
  assert.match(nybilClient, /\.\.\.garageContext\.values,[\s\S]*\.\.\.inventoryData,[\s\S]*source_garage_item_id/);
});

test('prefill resolves controls from the Nybil Field container, not as label children', () => {
  assert.match(prefillBridge, /label\?\.closest\('\.field'\) \?\? label\?\.parentElement/);
  assert.match(prefillBridge, /findFieldContainer\(labelText\)\?\.querySelector<HTMLSelectElement>\('select'\)/);
  assert.match(prefillBridge, /findFieldContainer\(labelText\)\?\.querySelector<HTMLInputElement>\('input'\)/);
});

test('planned Garage station code maps to Nybil main-station name', () => {
  assert.equal(resolvePlannedStationName('166', '166'), 'Malmö');
  assert.equal(resolvePlannedStationName('170', '170'), 'Helsingborg');
  assert.equal(resolvePlannedStationName('274', '274'), 'Halmstad');
  assert.equal(resolvePlannedStationName('Malmö', null), 'Malmö');
  assert.equal(resolvePlannedStationName('999', '999'), null);
});

test('unknown planning brand falls back to Nybil Annat plus exact source text', () => {
  const options = [
    { value: '', label: 'Välj bilmärke' },
    { value: 'MB', label: 'MB' },
    { value: 'VW', label: 'VW' },
    { value: 'Annat', label: 'Annat' },
  ];
  assert.deepEqual(resolveBrandPrefill('MB', options), { selectValue: 'MB', customValue: null });
  assert.deepEqual(resolveBrandPrefill('NISSAN', options), { selectValue: 'Annat', customValue: 'NISSAN' });
});

test('prefill and editable upstream context share one exact Garage snapshot', () => {
  assert.match(handoffClient, /handoffRequests = new Map/);
  assert.match(handoffClient, /const existing = handoffRequests\.get\(garageItemId\)/);
  assert.match(handoffClient, /handoffRequests\.set\(garageItemId, request\)/);
  assert.match(prefillBridge, /loadGarageNybilHandoff\(garageItemId\)/);
  assert.match(upstreamUi, /loadGarageNybilHandoff\(id\)/);
  assert.doesNotMatch(prefillBridge, /fetch\(`\/api\/garage\/nybil-handoff/);
  assert.doesNotMatch(upstreamUi, /fetch\(`\/api\/garage\/nybil-handoff/);
});

test('Nybil cannot be started outside an exact Garage handoff', () => {
  assert.match(nybilClient, /if \(!garageItemId\)/);
  assert.match(nybilClient, /Ny bil måste startas genom Hämta bilen från Garaget/);
  assert.match(nybilApi, /source_garage_item_id/);
  assert.match(nybilApi, /source_garage_updated_at/);
  assert.match(nybilApi, /status: 409/);
  assert.match(nybilPage, /<NybilFormGate \/>/);
  assert.doesNotMatch(nybilPage, /<FormClient \/>/);
  assert.match(nybilFormGate, /useSearchParams/);
  assert.match(nybilFormGate, /garage_item_id/);
  assert.match(nybilFormGate, /Ny bil kan inte startas manuellt/);
});

test('Garage-origin Nybil save fails closed if the carried context or version is missing', () => {
  assert.match(nybilClient, /if \(!garageContext\)/);
  assert.match(nybilClient, /versionsstämpel/);
  assert.match(upstreamUi, /source_garage_updated_at/);
});

test('database version-fences the exact Garage source row before Nybil insert', () => {
  assert.match(migration, /add column if not exists source_garage_updated_at timestamptz/);
  assert.match(migration, /guard_nybil_garage_source_version/);
  assert.match(migration, /for update/);
  assert.match(migration, /v_updated_at is distinct from new\.source_garage_updated_at/);
  assert.match(migration, /Garage-källan har ändrats sedan Ny bil hämtade informationen/);
  assert.match(nybilClient, /source_garage_updated_at: garageContext\.source_garage_updated_at/);
});

test('Nybil stores a receipt-side copy while source_garage_item_id preserves provenance', () => {
  for (const field of carriedFields) assert.match(migration, new RegExp(`add column if not exists ${field}`));
  assert.match(nybilClient, /source_garage_item_id: garageItemId/);
  assert.doesNotMatch(handoffApi, /\.update\(/);
  assert.doesNotMatch(handoffApi, /\.insert\(/);
  assert.doesNotMatch(handoffApi, /\.delete\(/);
});
