import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260909033000_lock_legacy_garage_ut_integrity_boundary_v1.sql', 'utf8');
const voidApi = readFileSync('app/api/garage/void/route.ts', 'utf8');
const legacyApi = readFileSync('app/api/garage/legacy-ut-handoff/route.ts', 'utf8');
const voidPanel = readFileSync('app/garage/garage-void-panel.tsx', 'utf8');

test('A: exact LEGACY retry resolves existing source/recipient before active Garage rejection', () => {
  const existingHandoff = migration.indexOf('select * into v_handoff');
  const activeGarage = migration.indexOf('Bilen har redan ett aktivt Garage-objekt');
  assert.ok(existingHandoff >= 0);
  assert.ok(activeGarage >= 0);
  assert.ok(existingHandoff < activeGarage);
  assert.match(migration, /where legacy_entry_id = v_legacy\.entry_id/);
  assert.match(migration, /'garageItem', to_jsonb\(v_item\)/);
  assert.match(migration, /'handoff', to_jsonb\(v_handoff\)/);
  assert.match(migration, /'avvecklaStarted', false/);
  assert.match(migration, /LEGACY retry konflikterar med befintlig source\/provenance\/recipient/);
  assert.doesNotMatch(migration, /update public\.garage_legacy_handoffs/i);
});

test('B: dedicated handoff table is runtime SELECT-only and TRUNCATE is rejected', () => {
  assert.match(migration, /revoke all privileges on table public\.garage_legacy_handoffs[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant select on table public\.garage_legacy_handoffs to service_role/i);
  assert.match(migration, /garage_legacy_handoffs_canonical_insert_v1/);
  assert.match(migration, /current_user <> 'postgres'/);
  assert.match(migration, /garage_legacy_handoffs_reject_truncate_v1/);
  assert.match(migration, /before truncate on public\.garage_legacy_handoffs/i);
});

test('C: canonical LEGACY recipient is protected from generic void at DB and API capability boundaries', () => {
  assert.match(migration, /create or replace function public\.is_canonical_legacy_garage_recipient_v1/);
  assert.match(migration, /public\.is_canonical_legacy_garage_recipient_v1\(v_item\.garage_item_id\)/);
  assert.match(migration, /public\.is_canonical_legacy_garage_recipient_v1\(old\.garage_item_id\)/);
  assert.match(voidApi, /is_canonical_legacy_garage_recipient_v1/);
  assert.match(voidApi, /VERIFIED_LEGACY_VOID_BLOCK_REASON/);
  assert.match(voidApi, /Verifierad LEGACY/);
  assert.match(voidPanel, /void_allowed/);
  assert.match(voidPanel, /void_block_reason/);
});

test('D: pending LEGACY ownership blocks MANUELL UT on insert and relevant update only while unconsumed', () => {
  assert.match(migration, /create or replace function public\.pending_legacy_garage_ut_entry_v1/);
  assert.match(migration, /l\.object_type = 'LEGACY_FLEET'/);
  assert.match(migration, /l\.historical_backfill = false/);
  assert.match(migration, /p0\.source_entity = 'vehicle_legacy_current_state_entries'/);
  assert.match(migration, /p0\.source_record_id = l\.entry_id::text/);
  assert.match(migration, /p0\.started_at = l\.verified_at/);
  assert.match(migration, /pc\.ended_at is null/);
  assert.match(migration, /not exists \([\s\S]*from public\.garage_legacy_handoffs h[\s\S]*h\.legacy_entry_id = l\.entry_id/);
  assert.match(migration, /new\.source_kind = 'MANUELL' and new\.garage_direction = 'UT'/);
  assert.match(migration, /before insert or update of source_kind, garage_direction, regnr, source_regnr on public\.garage_items/);
  assert.match(migration, /Pending verifierad LEGACY_FLEET äger nästa Garage UT-handslag/);
});

test('scope remains dedicated LEGACY, no generic handoff or automatic AVVECKLA/terminal UT', () => {
  assert.doesNotMatch(migration, /ensure_handoff_from_source/);
  assert.doesNotMatch(migration, /insert into public\.handoffs/i);
  assert.doesNotMatch(migration, /insert into public\.handoff_events/i);
  assert.doesNotMatch(migration, /start_garage_avveckla_case\s*\(/i);
  assert.doesNotMatch(migration, /complete_garage_avveckla_ut_internal\s*\(/i);
  assert.doesNotMatch(migration, /set\s+completed_at\s*=/i);
  assert.match(migration, /'avvecklaStarted', false/);
  assert.match(legacyApi, /materialize_legacy_fleet_to_garage_ut_v1/);
});
