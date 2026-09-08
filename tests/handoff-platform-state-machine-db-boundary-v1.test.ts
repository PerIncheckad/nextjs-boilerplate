import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'migrations/20260908204500_harden_handoff_platform_state_machine_db_boundary_v1.sql',
  'utf8',
);
const canonical = readFileSync(
  'migrations/20260906023000_add_salu_saljas_to_garage_ut_handoff_v1.sql',
  'utf8',
);
const saluDirection = readFileSync(
  'migrations/20260908100500_lock_salu_garage_direction_ut_v1.sql',
  'utf8',
);
const saluRecipient = readFileSync(
  'migrations/20260908185000_lock_verified_salu_garage_recipient_void_v1.sql',
  'utf8',
);

function block(pattern: RegExp) {
  const match = migration.match(pattern);
  assert.ok(match, `Missing migration block: ${pattern}`);
  return match[0];
}

test('runtime loses direct DML and truncate authority on generic handoff history', () => {
  assert.match(
    migration,
    /revoke all privileges on table public\.handoffs from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /revoke all privileges on table public\.handoff_events from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /grant select on table public\.handoffs to service_role/i);
  assert.match(migration, /grant select on table public\.handoff_events to service_role/i);
  assert.doesNotMatch(migration, /grant\s+(?:select\s*,\s*)?(?:insert|update|delete|truncate)[^;]*handoffs[^;]*service_role/i);
  assert.doesNotMatch(migration, /grant\s+(?:select\s*,\s*)?(?:insert|update|delete|truncate)[^;]*handoff_events[^;]*service_role/i);
});

test('new handoffs can only enter as clean REQUESTED rows', () => {
  assert.match(migration, /if new\.status <> 'REQUESTED'/i);
  assert.match(migration, /New handoff must start as REQUESTED/);
  assert.match(migration, /REQUESTED handoff cannot contain transition evidence/);
  assert.match(migration, /before insert or update or delete on public\.handoffs/i);
});

test('DB boundary encodes the canonical forward graph plus current cancellation path', () => {
  for (const edge of [
    "old.status = 'REQUESTED' and new.status in ('HANDED_OVER', 'CANCELLED')",
    "old.status = 'HANDED_OVER' and new.status in ('RECEIVED', 'CANCELLED')",
    "old.status = 'RECEIVED' and new.status in ('ACCEPTED', 'CANCELLED')",
    "old.status = 'ACCEPTED' and new.status in ('COMPLETED', 'CANCELLED')",
    "old.status = 'COMPLETED' and new.status in ('VERIFIED', 'CANCELLED')",
  ]) {
    assert.ok(migration.includes(edge), `Missing edge ${edge}`);
  }
  assert.match(migration, /Invalid handoff transition % -> %/);
});

test('identity and current provenance metadata are write-once', () => {
  const guard = block(/create or replace function public\.guard_handoff_write_boundary_v1\(\)[\s\S]*?\n\$\$;/i);
  for (const field of [
    'handoff_id',
    'handoff_code',
    'handoff_version',
    'regnr',
    'source_system',
    'source_entity',
    'source_record_id',
    'source_event_key',
    'created_at',
  ]) {
    assert.match(guard, new RegExp(`new\\.${field} is distinct from old\\.${field}`, 'i'));
  }
  for (const key of ['flagId', 'sourceEventType', 'sourcePayload', 'closureOutcome', 'closedAt', 'garageItemId']) {
    assert.ok(guard.includes(`'${key}'`), `Missing protected metadata key ${key}`);
  }
  assert.doesNotMatch(guard, /'nextAction'/);
});

test('VERIFIED and CANCELLED are terminal immutable rows', () => {
  assert.match(migration, /if old\.status in \('VERIFIED', 'CANCELLED'\)/i);
  assert.match(migration, /Terminal handoff is immutable/);
});

test('physical delete and truncate are rejected at the table boundary', () => {
  assert.match(migration, /Handoff rows cannot be physically deleted/);
  assert.match(migration, /before truncate on public\.handoffs/i);
  assert.match(migration, /before truncate on public\.handoff_events/i);
  assert.match(migration, /Handoff history cannot be truncated/);
});

test('handoff_events keeps row append-only protection and loses runtime insert authority', () => {
  assert.match(migration, /revoke all privileges on table public\.handoff_events/i);
  assert.match(migration, /grant select on table public\.handoff_events to service_role/i);
  assert.doesNotMatch(migration, /grant\s+insert\s+on\s+(?:table\s+)?public\.handoff_events\s+to\s+service_role/i);
});

test('ensure_handoff_from_source is create-or-return-exact and never refreshes provenance', () => {
  const ensure = block(/create or replace function public\.ensure_handoff_from_source\([\s\S]*?\n\$\$;/i);
  assert.match(ensure, /on conflict \(handoff_code, handoff_version, source_system, source_record_id\)\s*do nothing/i);
  assert.doesNotMatch(ensure, /do update/i);
  assert.doesNotMatch(ensure, /update\s+public\.handoffs/i);
  assert.match(ensure, /if not v_created then/i);
  assert.match(ensure, /Existing handoff has conflicting immutable identity\/provenance/);
  assert.match(ensure, /Existing handoff has conflicting immutable metadata key %/);
  assert.match(ensure, /return to_jsonb\(v_handoff\)/i);
});

test('exact retry can return without an audit mutation while create writes one REQUESTED event', () => {
  const ensure = block(/create or replace function public\.ensure_handoff_from_source\([\s\S]*?\n\$\$;/i);
  const returnIndex = ensure.indexOf('if not v_created then');
  const eventIndex = ensure.indexOf('insert into public.handoff_events');
  assert.ok(returnIndex >= 0 && eventIndex > returnIndex);
  assert.match(ensure, /'HANDOFF_REQUESTED'/);
  assert.match(ensure, /'REQUESTED'/);
});

test('migration is schema/function only and does not rewrite historical handoff data', () => {
  assert.doesNotMatch(migration, /\bupdate\s+public\.handoffs\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.handoffs\b/i);
  assert.doesNotMatch(migration, /\btruncate\s+(?:table\s+)?public\.handoffs\b/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.handoffs[\s\S]*?select\s+/i);
  assert.doesNotMatch(migration, /update\s+public\.handoff_events/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.handoff_events/i);
});

test('SALU remains a regression only: canonical exact source, #600 and #601 stay intact', () => {
  assert.match(canonical, /'SALU_TO_GARAGE_SALJAS'/);
  assert.match(canonical, /v_flag\.flag_id::text/);
  assert.match(canonical, /'salu-manual-close:' \|\| v_flag\.flag_id::text/);
  assert.match(canonical, /'garageItemId', v_item\.garage_item_id/);
  assert.match(canonical, /if \(v_handoff ->> 'status'\) = 'REQUESTED'/);
  assert.match(canonical, /'VERIFIED'/);
  assert.match(saluDirection, /garage_items_salu_source_direction_ut_chk/);
  assert.match(saluRecipient, /is_verified_salu_garage_recipient_v1/);
  assert.match(saluRecipient, /h\.source_event_key = 'salu-manual-close:' \|\| g\.source_salu_flag_id::text/);
  assert.match(saluRecipient, /h\.metadata ->> 'garageItemId' = g\.garage_item_id::text/);
  assert.doesNotMatch(migration, /create or replace function public\.materialize_salu_saljas_to_garage_ut_v1/i);
  assert.doesNotMatch(migration, /create or replace function public\.is_verified_salu_garage_recipient_v1/i);
  assert.doesNotMatch(migration, /garage_items_salu_source_direction_ut_chk/);
});
