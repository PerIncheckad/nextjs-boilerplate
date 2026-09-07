import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hardening = readFileSync(
  join(process.cwd(), 'migrations/20260907124500_harden_rental_source_helper_permissions_v1.sql'),
  'utf8',
);

const rentalWriteThrough = readFileSync(
  join(process.cwd(), 'migrations/20260823104500_add_rental_period_write_through_v1.sql'),
  'utf8',
);

const closeSignature = 'close_rental_period_from_source\\(uuid, text, timestamptz, text, text, uuid, uuid\\)';
const insertSignature = 'insert_closed_rental_period_from_source\\(uuid, text, timestamptz, timestamptz, text, text, uuid, uuid, text, text\\)';

test('rental source helpers lose direct EXECUTE for every runtime-facing role', () => {
  for (const signature of [closeSignature, insertSignature]) {
    assert.match(
      hardening,
      new RegExp(`revoke execute on function public\\.${signature}[\\s\\S]*from public, anon, authenticated, service_role`, 'i'),
    );
  }
});

test('permission migration changes no RENTAL business logic or data', () => {
  assert.doesNotMatch(hardening, /create or replace function/i);
  assert.doesNotMatch(hardening, /insert\s+into/i);
  assert.doesNotMatch(hardening, /update\s+public\./i);
  assert.doesNotMatch(hardening, /delete\s+from/i);
  assert.doesNotMatch(hardening, /alter\s+table/i);
  assert.doesNotMatch(hardening, /create\s+trigger/i);
  assert.doesNotMatch(hardening, /drop\s+trigger/i);
  assert.doesNotMatch(hardening, /grant\s+execute/i);
});

test('canonical rental adapter remains the source-validating runtime adapter', () => {
  assert.match(rentalWriteThrough, /create or replace function public\.try_write_through_rental_period\(/i);
  assert.match(rentalWriteThrough, /from public\.rental_operational_facts[\s\S]*where rental_fact_id\s*=\s*p_rental_fact_id/i);
  assert.match(rentalWriteThrough, /perform public\.close_rental_period_from_source\(/i);
  assert.match(rentalWriteThrough, /perform public\.insert_closed_rental_period_from_source\(/i);
  assert.match(rentalWriteThrough, /grant execute on function public\.try_write_through_rental_period\(uuid\)[\s\S]*to service_role/i);
  assert.doesNotMatch(hardening, /try_write_through_rental_period/i);
});

test('generic Layer1 paths remain unable to manufacture or terminate source-owned RENTAL', () => {
  assert.match(rentalWriteThrough, /RENTAL may only be started by G \/ UtDt from rental_operational_facts/i);
  assert.match(rentalWriteThrough, /RENTAL may only be ended once by H \/ InDt from its rental source/i);
  assert.match(rentalWriteThrough, /before insert on public\.vehicle_journey_periods/i);
  assert.match(rentalWriteThrough, /before update on public\.vehicle_journey_periods/i);
});
