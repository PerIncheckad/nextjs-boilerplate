import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260906163000_garage_information_continuity_h_v1.sql', 'utf8');
const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const garageUi = readFileSync('app/garage/garage-client.tsx', 'utf8');
const garagePage = readFileSync('app/garage/page.tsx', 'utf8');
const handoffApi = readFileSync('app/api/garage/nybil-handoff/route.ts', 'utf8');
const nybilUpstream = readFileSync('app/nybil/garage-upstream-context.tsx', 'utf8');
const nybilPrefill = readFileSync('app/nybil/garage-prefill-bridge.tsx', 'utf8');

test('H adds only future Garage returadress plus append-only information audit', () => {
  assert.match(migration, /add column if not exists returadress text/);
  assert.match(migration, /create table if not exists public\.garage_information_events/);
  for (const field of ['regnr', 'returadress', 'planned_delivery_date', 'daily_rate']) assert.match(migration, new RegExp(field));
  assert.match(migration, /old_value jsonb/);
  assert.match(migration, /new_value jsonb/);
  assert.match(migration, /changed_by uuid/);
  assert.match(migration, /source_provenance jsonb/);
  assert.match(migration, /append-only/);
  assert.doesNotMatch(migration, /update public\.garage_items\s+set returadress/i);
});

test('Garage daily rate cannot reverse-write or fan out through apply_first_garage_model_defaults', () => {
  const fn = migration.match(/create or replace function public\.apply_first_garage_model_defaults\(\)[\s\S]*?\n\$\$;/)?.[0] ?? '';
  assert.doesNotMatch(fn, /planning_vehicle_models[\s\S]*daily_rate/);
  assert.doesNotMatch(fn, /set daily_rate = new\.daily_rate/);
  assert.match(fn, /holding_period_months/);
});

test('future Planering materialization does not fabricate calloff date and reflects confirmed upstream state', () => {
  const fn = migration.match(/create or replace function public\.finalize_planning_period_to_garage\([\s\S]*?\n\$\$;/)?.[0] ?? '';
  assert.doesNotMatch(fn, /v_calloff_date/);
  assert.doesNotMatch(fn, /calloff_at/);
  assert.match(fn, /'BEKRAFTAD'/);
  assert.match(fn, /'PLANERING'/);
  assert.match(fn, /'IN'/);
});

test('Garage operator edits only the H current information set on IN', () => {
  assert.match(garageUi, /Returadress/);
  assert.match(garageUi, /Förväntad ankomst/);
  assert.match(garageUi, /Dygnsdeb/);
  assert.match(garageUi, /Reg\.nr/);
  assert.doesNotMatch(garageUi, /Field label="Beställd"/);
  assert.doesNotMatch(garageUi, /Field label="Avropad"/);
  assert.doesNotMatch(garageUi, /Field label="Bekräftelse"/);
  assert.doesNotMatch(garageUi, /Field label="Transport"/);
  assert.doesNotMatch(garagePage, /OrderWorkflowPanel/);
});

test('returadress and current Garage image continue through exact Nybil handoff', () => {
  assert.match(garageApi, /returadress/);
  assert.match(handoffApi, /returadress/);
  assert.match(nybilUpstream, /returadress/);
  assert.match(nybilPrefill, /findFieldInput\('Returadress'\)/);
  assert.match(nybilPrefill, /data\.returadress/);
  assert.doesNotMatch(handoffApi, /\.update\(/);
});

test('H does not create an incoming transport engine or change Garage Core ownership', () => {
  assert.doesNotMatch(garagePage, /BESTÄLLNING \/ LEVERANS/);
  assert.doesNotMatch(garagePage, /OrderWorkflowPanel/);
  assert.match(garagePage, /STAGING \/ ROUTING \/ HANDOFF/);
  assert.doesNotMatch(migration, /EXTERN_TRANSPORT/);
  assert.doesNotMatch(migration, /TRANSPORTOR_HAMTAT_VERIFIERAD/);
});
