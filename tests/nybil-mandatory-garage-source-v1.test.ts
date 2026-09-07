import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260908004000_require_nybil_garage_source_v1.sql', 'utf8');
const voidedFix = readFileSync('migrations/20260907213500_harden_nybil_garage_voided_source_v1.sql', 'utf8');
const originalHandoff = readFileSync('migrations/20260826014500_add_garage_v2_handoffs.sql', 'utf8');
const nybilApi = readFileSync('app/api/nybil/route.ts', 'utf8');
const handoffApi = readFileSync('app/api/garage/nybil-handoff/route.ts', 'utf8');
const picker = readFileSync('app/nybil/garage-picker.tsx', 'utf8');
const nybilClient = readFileSync('lib/nybil-api-client.ts', 'utf8');

test('BEFORE INSERT guard is mandatory for every future Nybil insert', () => {
  assert.match(migration, /create trigger nybil_garage_source_version_guard\s+before insert on public\.nybil_inventering\s+for each row\s+execute function public\.guard_nybil_garage_source_version\(\)/i);
  assert.doesNotMatch(migration, /when\s*\(\s*new\.source_garage_item_id is not null\s*\)/i);
  assert.match(migration, /if new\.source_garage_item_id is null then[\s\S]*Ny bil kräver exakt Garage-källa/i);
  assert.match(migration, /if new\.source_garage_updated_at is null then[\s\S]*Garage-källans versionsstämpel saknas/i);
});

test('authenticated and service-role direct source-less inserts hit the same DB trigger boundary', () => {
  assert.match(migration, /before insert on public\.nybil_inventering/i);
  assert.doesNotMatch(migration, /current_user|session_user|auth\.role|service_role|authenticated/i);
});

test('#597 void, stale and already-handed-off fences are preserved', () => {
  assert.match(migration, /select updated_at, handed_off_nybil_id, voided_at/i);
  assert.match(migration, /where garage_item_id = new\.source_garage_item_id[\s\S]*for update/i);
  assert.match(migration, /if v_voided_at is not null then[\s\S]*cannot be handed off to Nybil/i);
  assert.match(migration, /if v_handed_off_nybil_id is not null then/);
  assert.match(migration, /v_updated_at is distinct from new\.source_garage_updated_at/);
  assert.match(voidedFix, /if v_voided_at is not null then/);
});

test('canonical Garage IN handoff and exact garage_item_id identity remain unchanged', () => {
  assert.match(nybilApi, /source_garage_item_id/);
  assert.match(nybilApi, /source_garage_updated_at/);
  assert.match(nybilClient, /source_garage_item_id: garageItemId/);
  assert.match(picker, /value=\{item\.garage_item_id\}/);
  assert.match(picker, /garage_item_id=\$\{encodeURIComponent\(selectedGarageItemId\)\}/);
  assert.match(originalHandoff, /v_item\.garage_direction <> 'IN'/);
  assert.match(originalHandoff, /Garage\/Nybil regnr mismatch/);
});

test('Garage IN without regnr remains selectable but cannot complete final handoff', () => {
  assert.doesNotMatch(handoffApi, /\.not\('regnr',\s*'is',\s*null\)/);
  assert.match(picker, /SAKNAR REGNR/);
  assert.match(originalHandoff, /v_item\.regnr is null[\s\S]*Garage\/Nybil regnr mismatch/);
});

test('scope is future-write only and does not rewrite historical data or unrelated contracts', () => {
  assert.doesNotMatch(migration, /alter table|create table|drop table|create index|drop index|not null/i);
  assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /create or replace function public\.sync_nybil_garage_handoff/i);
  assert.doesNotMatch(migration, /completed_at/i);
  assert.doesNotMatch(migration, /grant |revoke /i);
});
