import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const writeThrough = readFileSync(
  join(process.cwd(), 'migrations/20260820231226_add_checkpoint_write_through_adapters_v1.sql'),
  'utf8',
);
const actorIdentity = readFileSync(
  join(process.cwd(), 'migrations/20260820231719_harden_checkpoint_write_through_actor_identity_v1.sql'),
  'utf8',
);
const repairSync = readFileSync(
  join(process.cwd(), 'migrations/20260820230052_sync_and_harden_checkpoint_sources_v1.sql'),
  'utf8',
);

test('write-through adapters cover Nybil, completed Check-in and SALU creation', () => {
  assert.match(writeThrough, /create trigger nybil_checkpoint_write_through[\s\S]*after insert or update on public\.nybil_inventering/i);
  assert.match(writeThrough, /create trigger checkin_checkpoint_write_through[\s\S]*after insert or update on public\.checkins/i);
  assert.match(writeThrough, /when \(new\.status = 'COMPLETED' and new\.completed_at is not null\)/i);
  assert.match(writeThrough, /create trigger salu_checkpoint_write_through[\s\S]*after insert on public\.salu_flags/i);

  assert.match(writeThrough, /'NYBIL_BASELINE_CAPTURED'/);
  assert.match(writeThrough, /'CHECKIN_COMPLETED'/);
  assert.match(writeThrough, /'SALU_CYCLE_CREATED'/);
  assert.match(writeThrough, /'nybil:' \|\| new\.id::text/i);
  assert.match(writeThrough, /'checkin:' \|\| new\.id::text/i);
  assert.match(writeThrough, /'salu:' \|\| new\.flag_id::text/i);
});

test('source writes remain authoritative when checkpoint write-through fails', () => {
  assert.match(writeThrough, /function public\.try_record_verified_source_checkpoint/i);
  assert.match(writeThrough, /perform public\.record_verified_source_checkpoint/i);
  assert.match(writeThrough, /exception when others/i);
  assert.match(writeThrough, /insert into public\.checkpoint_write_through_failures as failure/i);
  assert.match(writeThrough, /on conflict \(regnr, checkpoint_code, cycle_key, source_entity, source_record_id\)/i);
  assert.match(writeThrough, /attempts = failure\.attempts \+ 1/i);
  assert.match(writeThrough, /return false/i);
  assert.doesNotMatch(writeThrough, /raise exception '\[checkpoint-write-through\]/i);
});

test('failed write-through is durable, server-only and repairable through source sync', () => {
  assert.match(writeThrough, /create table public\.checkpoint_write_through_failures/i);
  assert.match(writeThrough, /where resolved_at is null/i);
  assert.match(writeThrough, /function public\.resolve_checkpoint_write_through_failure/i);
  assert.match(writeThrough, /after update of status, source_context on public\.vehicle_checkpoints/i);
  assert.match(writeThrough, /set resolved_at = coalesce\(resolved_at, pg_catalog\.now\(\)\)/i);
  assert.match(writeThrough, /enable row level security/i);
  assert.match(writeThrough, /revoke all on public\.checkpoint_write_through_failures from public, anon, authenticated/i);
  assert.match(writeThrough, /grant select, insert, update, delete on public\.checkpoint_write_through_failures to service_role/i);

  assert.match(repairSync, /function public\.sync_vehicle_source_checkpoints/i);
  assert.match(repairSync, /record_verified_source_checkpoint/g);
});

test('write-through functions stay server-controlled while source-table triggers can invoke them', () => {
  for (const functionName of [
    'try_record_verified_source_checkpoint',
    'write_through_nybil_checkpoint',
    'write_through_checkin_checkpoint',
    'write_through_salu_checkpoint',
  ]) {
    assert.match(
      writeThrough,
      new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]*from public, anon, authenticated`, 'i'),
    );
    assert.match(
      writeThrough,
      new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]*to service_role`, 'i'),
    );
  }

  assert.match(writeThrough, /language plpgsql[\s\S]*security definer[\s\S]*set search_path = pg_catalog/i);
});

test('write-through actor identity never stores a display name in actor_email', () => {
  assert.match(actorIdentity, /nullif\(auth\.jwt\(\) ->> 'email', ''\)/i);
  assert.match(actorIdentity, /coalesce\(nullif\(trim\(new\.checker_email\), ''\), nullif\(auth\.jwt\(\) ->> 'email', ''\)\)/i);
  assert.match(actorIdentity, /'registeredBy', new\.registrerad_av/i);
  assert.match(actorIdentity, /'fullName', new\.fullstandigt_namn/i);
  assert.doesNotMatch(actorIdentity, /nullif\(trim\(new\.registrerad_av\), ''\)/i);
});

test('write-through migration does not backfill historical source rows', () => {
  assert.doesNotMatch(writeThrough, /from public\.nybil_inventering/i);
  assert.doesNotMatch(writeThrough, /from public\.checkins/i);
  assert.doesNotMatch(writeThrough, /from public\.salu_flags/i);
  assert.doesNotMatch(writeThrough, /insert into public\.vehicle_checkpoints[\s\S]*select/i);
});
