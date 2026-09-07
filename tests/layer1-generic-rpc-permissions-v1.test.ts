import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hardening = readFileSync(
  join(process.cwd(), 'migrations/20260907191500_harden_layer1_generic_rpc_permissions_v1.sql'),
  'utf8',
);

const split = readFileSync(
  join(process.cwd(), 'migrations/20260821113000_split_vehicle_state_and_activity_periods.sql'),
  'utf8',
);

const nybil = readFileSync(
  join(process.cwd(), 'migrations/20260821144700_add_nybil_period_write_through.sql'),
  'utf8',
);

const status = readFileSync(
  join(process.cwd(), 'migrations/20260821125500_add_vehicle_status_period_write_through.sql'),
  'utf8',
);

const checkin = readFileSync(
  join(process.cwd(), 'migrations/20260821153000_add_checkin_downtime_period_write_through.sql'),
  'utf8',
);

const rental = readFileSync(
  join(process.cwd(), 'migrations/20260823104500_add_rental_period_write_through_v1.sql'),
  'utf8',
);

const legacy = readFileSync(
  join(process.cwd(), 'migrations/20260903210000_add_legacy_current_state_entry_v1.sql'),
  'utf8',
);

const reconciliation = readFileSync(
  join(process.cwd(), 'migrations/20260903104500_add_current_state_reconciliation_v1.sql'),
  'utf8',
);

const avveckla = readFileSync(
  join(process.cwd(), 'migrations/20260902233000_add_garage_avveckla_terminal_handoffs_v1.sql'),
  'utf8',
);

const periodApi = readFileSync(
  join(process.cwd(), 'app/api/vehicle-journey/periods/route.ts'),
  'utf8',
);

const signatures = [
  'start_vehicle_journey_period\\(uuid, text, text, timestamptz, text, text, uuid, text\\)',
  'transition_vehicle_journey_state\\(uuid, text, text, timestamptz, text, text, text, text, text, uuid, text, text, jsonb\\)',
  'close_vehicle_journey_period\\(uuid, text, timestamptz, uuid, text\\)',
];

test('all generic Layer1 RPCs lose direct EXECUTE for runtime-facing roles', () => {
  for (const signature of signatures) {
    assert.match(
      hardening,
      new RegExp(`revoke execute on function public\\.${signature}[\\s\\S]*from public, anon, authenticated, service_role`, 'i'),
    );
  }
});

test('permission migration changes no function implementation, trigger, business logic or data', () => {
  assert.doesNotMatch(hardening, /create or replace function/i);
  assert.doesNotMatch(hardening, /insert\s+into/i);
  assert.doesNotMatch(hardening, /update\s+public\./i);
  assert.doesNotMatch(hardening, /delete\s+from/i);
  assert.doesNotMatch(hardening, /alter\s+table/i);
  assert.doesNotMatch(hardening, /create\s+trigger/i);
  assert.doesNotMatch(hardening, /drop\s+trigger/i);
  assert.doesNotMatch(hardening, /grant\s+execute/i);
});

test('canonical source adapters still call transition internally', () => {
  assert.match(nybil, /perform public\.transition_vehicle_journey_state\(/i);
  assert.match(status, /perform public\.transition_vehicle_journey_state\(/i);
  assert.match(checkin, /perform public\.transition_vehicle_journey_state\(/i);
  assert.match(rental, /perform public\.transition_vehicle_journey_state\(/i);
  assert.match(legacy, /public\.transition_vehicle_journey_state\(/i);
  assert.match(reconciliation, /public\.transition_vehicle_journey_state\(/i);
});

test('canonical adapters remain postgres-owned SECURITY DEFINER contracts in source migrations', () => {
  for (const sql of [nybil, status, checkin, rental, legacy, reconciliation]) {
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path\s*=\s*pg_catalog/i);
  }
});

test('legacy start delegates to transition but no runtime route depends on generic primary-state RPCs', () => {
  assert.match(split, /function public\.start_vehicle_journey_period/i);
  assert.match(split, /public\.transition_vehicle_journey_state\(/i);
  assert.doesNotMatch(periodApi, /rpc\('start_vehicle_journey_period'/);
  assert.doesNotMatch(periodApi, /rpc\('transition_vehicle_journey_state'/);
  assert.doesNotMatch(periodApi, /rpc\('close_vehicle_journey_period'/);
});

test('Vagnkort keeps primary Layer1 writes blocked', () => {
  assert.match(periodApi, /action === 'START' \|\| action === 'TRANSITION' \|\| action === 'CLOSE'/);
  assert.match(periodApi, /Primary vehicle state is source-controlled and cannot be changed manually from Vagnkort/);
});

test('AVVECKLA remains on separate source-aware close path and is untouched by hardening', () => {
  assert.match(avveckla, /close_vehicle_journey_period_from_source/);
  assert.doesNotMatch(hardening, /close_vehicle_journey_period_from_source/);
});

test('next source-helper boundary package remains explicitly out of scope', () => {
  for (const fn of [
    'try_write_through_nybil_period',
    'try_write_through_vehicle_status_period',
    'try_write_through_checkin_downtime_period',
    'close_vehicle_journey_period_from_source',
  ]) {
    assert.doesNotMatch(hardening, new RegExp(fn, 'i'));
  }
});
