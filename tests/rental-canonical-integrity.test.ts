import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260823114500_harden_rental_canonical_integrity.sql'),
  'utf8',
);

test('conflicting source rows remain RAW evidence instead of rewriting canonical G H or I', () => {
  assert.match(migration, /create table public\.rental_operational_projection_failures/i);
  assert.match(migration, /projectionAccepted', false/i);
  assert.match(migration, /OUT_AT_CHANGED/i);
  assert.match(migration, /IN_AT_REMOVED/i);
  assert.match(migration, /IN_AT_CHANGED/i);
  assert.match(migration, /REGNR_CHANGED/i);
  assert.match(migration, /insert into public\.rental_source_rows_raw[\s\S]*select \* into v_existing_fact/i);
});

test('G and I are immutable and H may only move from unknown to one known value', () => {
  assert.match(migration, /RENTAL canonical I \/ RegNr is immutable once established/i);
  assert.match(migration, /RENTAL canonical G \/ UtDt is immutable once established/i);
  assert.match(migration, /old\.in_at is not null and new\.in_at is distinct from old\.in_at/i);
  assert.match(migration, /v_existing_fact\.in_at is not null and p_in_at is null/i);
  assert.match(migration, /v_existing_fact\.in_at is not null and v_existing_fact\.in_at is distinct from p_in_at/i);
});

test('canonical table has a database-boundary guard against direct service-role drift', () => {
  assert.match(migration, /function public\.guard_rental_operational_fact_immutability/i);
  assert.match(migration, /before update on public\.rental_operational_facts/i);
  assert.match(migration, /security invoker/i);
});

test('projection conflict ledger is server-only and the rental fact FK is indexed', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.rental_operational_projection_failures from public, anon, authenticated/i);
  assert.match(migration, /rental_operational_projection_failures_fact_idx/i);
});

test('hardening does not invent vehicle state or touch Kistan', () => {
  assert.doesNotMatch(migration, /'AVAILABLE'/i);
  assert.doesNotMatch(migration, /transition_vehicle_journey_state/i);
  assert.doesNotMatch(migration, /vehicle_journey_periods/i);
  assert.doesNotMatch(migration, /vehicle_journey_events/i);
  assert.doesNotMatch(migration, /kistan/i);
});
