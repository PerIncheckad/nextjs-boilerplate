import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260907213500_harden_nybil_garage_voided_source_v1.sql', 'utf8');
const originalHandoff = readFileSync('migrations/20260826014500_add_garage_v2_handoffs.sql', 'utf8');
const continuity = readFileSync('migrations/20260902112000_nybil_upstream_information_continuity.sql', 'utf8');
const handoffApi = readFileSync('app/api/garage/nybil-handoff/route.ts', 'utf8');
const picker = readFileSync('app/nybil/garage-picker.tsx', 'utf8');
const nybilClient = readFileSync('lib/nybil-api-client.ts', 'utf8');

test('Nybil BEFORE INSERT guard rejects an exact Garage source that is voided', () => {
  assert.match(migration, /create or replace function public\.guard_nybil_garage_source_version\(\)/i);
  assert.match(migration, /select updated_at, handed_off_nybil_id, voided_at/i);
  assert.match(migration, /where garage_item_id = new\.source_garage_item_id[\s\S]*for update/i);
  assert.match(migration, /if v_voided_at is not null then[\s\S]*cannot be handed off to Nybil/i);
});

test('active exact source remains eligible and existing version and one-to-one fences remain', () => {
  assert.match(migration, /if v_handed_off_nybil_id is not null then/);
  assert.match(migration, /v_updated_at is distinct from new\.source_garage_updated_at/);
  assert.match(migration, /Garage-källan har ändrats sedan Ny bil hämtade informationen/);
  assert.doesNotMatch(migration, /garage_direction/);
  assert.match(originalHandoff, /v_item\.garage_direction <> 'IN'/);
  assert.match(originalHandoff, /Garage\/Nybil regnr mismatch/);
  assert.match(originalHandoff, /nybil_inventering_source_garage_uidx/);
});

test('row lock remains on the exact Garage source before source legitimacy checks', () => {
  assert.match(migration, /from public\.garage_items[\s\S]*where garage_item_id = new\.source_garage_item_id[\s\S]*for update/);
  assert.match(continuity, /create trigger nybil_garage_source_version_guard[\s\S]*before insert on public\.nybil_inventering/);
  assert.match(originalHandoff, /create trigger nybil_garage_handoff_sync[\s\S]*after insert on public\.nybil_inventering/);
});

test('Garage IN without regnr remains selectable but final handoff still requires matching regnr', () => {
  assert.doesNotMatch(handoffApi, /\.not\('regnr',\s*'is',\s*null\)/);
  assert.match(picker, /SAKNAR REGNR/);
  assert.match(picker, /value=\{item\.garage_item_id\}/);
  assert.match(originalHandoff, /v_item\.regnr is null[\s\S]*Garage\/Nybil regnr mismatch/);
});

test('handoff identity remains exact garage_item_id and never regnr inference', () => {
  assert.match(picker, /garage_item_id=\$\{encodeURIComponent\(selectedGarageItemId\)\}/);
  assert.match(nybilClient, /source_garage_item_id: garageItemId/);
  assert.match(migration, /new\.source_garage_item_id/);
});

test('scope does not rewrite sync function, picker, schema, or data', () => {
  assert.doesNotMatch(migration, /create or replace function public\.sync_nybil_garage_handoff/i);
  assert.doesNotMatch(migration, /alter table|create table|drop table|create index|drop index/i);
  assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /completed_at/i);
});
