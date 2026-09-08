import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'migrations/20260908185000_lock_verified_salu_garage_recipient_void_v1.sql',
  'utf8',
);
const canonical = readFileSync(
  'migrations/20260906023000_add_salu_saljas_to_garage_ut_handoff_v1.sql',
  'utf8',
);
const directionInvariant = readFileSync(
  'migrations/20260908100500_lock_salu_garage_direction_ut_v1.sql',
  'utf8',
);
const voidApi = readFileSync('app/api/garage/void/route.ts', 'utf8');
const voidUi = readFileSync('app/garage/garage-void-panel.tsx', 'utf8');

test('A/B: exact canonical VERIFIED recipient is protected by the DB void boundary', () => {
  assert.match(migration, /is_verified_salu_garage_recipient_v1/);
  assert.match(migration, /h\.handoff_code = 'SALU_TO_GARAGE_SALJAS'/);
  assert.match(migration, /h\.handoff_version = 1/);
  assert.match(migration, /h\.status = 'VERIFIED'/);
  assert.match(migration, /h\.source_system = 'SALU'/);
  assert.match(migration, /h\.source_entity = 'salu_flags'/);
  assert.match(migration, /h\.source_record_id = g\.source_salu_flag_id::text/);
  assert.match(migration, /h\.source_event_key = 'salu-manual-close:' \|\| g\.source_salu_flag_id::text/);
  assert.match(migration, /h\.metadata ->> 'flagId' = g\.source_salu_flag_id::text/);
  assert.match(migration, /h\.metadata ->> 'garageItemId' = g\.garage_item_id::text/);
  assert.match(migration, /g\.garage_item_id = p_garage_item_id/);
  assert.match(migration, /g\.source_kind = 'SALU'/);
  assert.match(migration, /old\.voided_at is null and new\.voided_at is not null/);
  assert.match(migration, /is_verified_salu_garage_recipient_v1\(old\.garage_item_id\)/);
  assert.match(migration, /garage_items_void_state_guard/);
  assert.match(migration, /before update on public\.garage_items/);
  assert.match(migration, /Verifierad SALU → Garage-mottagare kan inte makuleras/);
});

test('C: generic void RPC rejects the exact canonical VERIFIED recipient before generic voiding', () => {
  assert.match(migration, /create or replace function public\.void_garage_item/);
  assert.match(migration, /is_verified_salu_garage_recipient_v1\(v_item\.garage_item_id\)/);
  assert.match(migration, /v_item\.handed_off_nybil_id is not null/);
  assert.match(migration, /garage_wheel_changes/);
  assert.match(migration, /p_actor is null/);
  assert.match(migration, /v_reason is null/);
});

test('D: void API exposes DB-derived capability and returns conflict for the DB rejection', () => {
  assert.match(voidApi, /export async function GET/);
  assert.match(voidApi, /admin\.rpc\('is_verified_salu_garage_recipient_v1'/);
  assert.match(voidApi, /void_allowed: !protectedRecipient/);
  assert.match(voidApi, /void_block_reason:/);
  assert.match(voidApi, /admin\.rpc\('void_garage_item'/);
  assert.match(voidApi, /Verifierad SALU\|kan inte makuleras/);
  assert.match(voidApi, /status: blocked \? 409 : 500/);
});

test('E: UI uses exact server-derived void capability and offers no Ta bort action when blocked', () => {
  assert.match(voidUi, /\/api\/garage\/void\?garage_item_id=/);
  assert.match(voidUi, /void_allowed: capabilityPayload\?\.data\?\.void_allowed === true/);
  assert.match(voidUi, /item\.void_allowed === true \? \(/);
  assert.match(voidUi, /<span title=\{item\.void_block_reason \?\? undefined\}>Låst<\/span>/);
  assert.doesNotMatch(voidUi, /item\.source_kind === 'SALU'\s*&&[^\n]*void_allowed/);
});

test('F/G/H: rejected generic void preserves active recipient so canonical retry reuses the same Garage item and handoff', () => {
  assert.match(canonical, /pg_advisory_xact_lock/);
  assert.match(canonical, /source_kind = 'SALU'[\s\S]*source_salu_flag_id = v_flag\.flag_id[\s\S]*voided_at is null[\s\S]*for update/);
  assert.match(canonical, /v_handoff := public\.ensure_handoff_from_source/);
  assert.match(canonical, /v_flag\.flag_id::text/);
  assert.match(canonical, /'garageItemId', v_item\.garage_item_id/);
  assert.match(canonical, /if \(v_handoff ->> 'status'\) = 'REQUESTED'/);
  assert.match(canonical, /'VERIFIED'/);
  assert.doesNotMatch(migration, /update\s+public\.handoffs/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.handoffs/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.handoffs/i);
});

test('I: non-canonical Garage keeps the existing generic void contract', () => {
  assert.match(migration, /if v_item\.voided_at is not null then[\s\S]*return v_item/);
  assert.match(migration, /update public\.garage_items[\s\S]*set voided_at = clock_timestamp\(\)/);
  assert.doesNotMatch(migration, /source_kind = 'PLANERING'[\s\S]*raise exception/i);
  assert.doesNotMatch(migration, /source_kind = 'MANUELL'[\s\S]*raise exception/i);
  assert.doesNotMatch(migration, /source_kind = 'LAGER1'[\s\S]*raise exception/i);
});

test('J: migration contains no data backfill or historical SALU rewrite', () => {
  assert.doesNotMatch(migration, /insert\s+into\s+public\.garage_items/i);
  assert.doesNotMatch(migration, /update\s+public\.garage_items\s+set\s+garage_direction/i);
  assert.doesNotMatch(migration, /update\s+public\.salu_flags/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.handoffs/i);
});

test('K/L: AVVECKLA and terminal journey semantics are untouched', () => {
  assert.doesNotMatch(migration, /garage_avveckla_cases/);
  assert.doesNotMatch(migration, /start_garage_avveckla_case/);
  assert.doesNotMatch(migration, /vehicle_journey_periods/);
  assert.doesNotMatch(migration, /rental_operational_facts/);
  assert.doesNotMatch(migration, /completed_at\s*=/);
});

test('canonical SALU materializer and #600 direction invariant remain unchanged in contract', () => {
  assert.match(canonical, /new\.status = 'STÄNGD'/);
  assert.match(canonical, /new\.closure_outcome = 'SÄLJAS'/);
  assert.match(canonical, /v_flag\.closed_by is null or v_flag\.closed_at is null/);
  assert.match(canonical, /'nextAction', 'START_AVVECKLA_MANUALLY'/);
  assert.match(canonical, /'avvecklaStarted', false/);
  assert.match(directionInvariant, /garage_items_salu_source_direction_ut_chk/);
  assert.match(directionInvariant, /garage_direction is not distinct from 'UT'/);
  assert.doesNotMatch(migration, /create or replace function public\.materialize_salu_saljas_to_garage_ut_v1/);
  assert.doesNotMatch(migration, /garage_items_salu_source_direction_ut_chk/);
});
