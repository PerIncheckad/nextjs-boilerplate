import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260820_create_salu_process_domain.sql'),
  'utf8',
);

test('SALU persistence migration creates the required process-domain objects', () => {
  for (const table of [
    'salu_auto_rules',
    'salu_stillestand_causes',
    'salu_vehicle_state',
    'salu_flags',
    'salu_checkpoints',
    'salu_inline_actions',
    'salu_child_processes',
    'salu_events',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
  }
});

test('SALU flag invariants keep ownership, status and escalation separate', () => {
  assert.match(migration, /owner_function text not null default 'BILKONTROLL'/);
  assert.match(migration, /NY', 'HANDLÄGGS', 'VÄNTAR', 'SLUTBEDÖMNING', 'STÄNGD'/);
  assert.match(migration, /NORMAL', 'T10', 'PASSERAD'/);
  assert.match(migration, /salu_flags_one_active_per_regnr_idx/);
  assert.match(migration, /where status <> 'STÄNGD'/);
});

test('SALU child process storage reflects the locked handshake and closure terminal states', () => {
  assert.match(migration, /CREATED', 'ACCEPTED', 'IN_PROGRESS', 'READY_FOR_VERIFICATION', 'VERIFIED', 'CANCELLED'/);
  assert.match(migration, /status <> 'ACCEPTED' or \(accepted_by is not null and accepted_at is not null\)/);
  assert.match(migration, /status <> 'VERIFIED' or \(verified_by is not null and verified_at is not null\)/);
  assert.match(migration, /status <> 'CANCELLED' or cancel_reason is not null/);
});

test('SALU event history is append-only and supports correcting events', () => {
  assert.match(migration, /correction_of_event_id uuid references public\.salu_events/);
  assert.match(migration, /reject_salu_event_mutation/);
  assert.match(migration, /before update on public\.salu_events/);
  assert.match(migration, /before delete on public\.salu_events/);
  assert.doesNotMatch(migration, /grant select, insert, update, delete on public\.salu_events to service_role/i);
  assert.match(migration, /grant select, insert on public\.salu_events to service_role/i);
});

test('SALU persistence migration is server-only by default', () => {
  for (const table of [
    'salu_auto_rules',
    'salu_stillestand_causes',
    'salu_vehicle_state',
    'salu_flags',
    'salu_checkpoints',
    'salu_inline_actions',
    'salu_child_processes',
    'salu_events',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'));
  }
});

test('Kistan identity and monetary fields are not introduced into the SALU process schema', () => {
  assert.doesNotMatch(migration, /kistan/i);
  assert.doesNotMatch(migration, /monetary|amount|currency|cost|revenue/i);
});
