import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260830010000_atomic_planning_garage_handoff.sql', 'utf8');
const route = readFileSync('app/api/planning/period-status/route.ts', 'utf8');

test('KLAR and Garage materialization are one database transaction', () => {
  assert.match(migration, /create or replace function public\.finalize_planning_period_to_garage/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /insert into public\.garage_items/);
  assert.match(migration, /insert into public\.garage_direction_events/);
  assert.match(migration, /insert into public\.planning_period_status/);
  assert.match(migration, /Atomically materializes missing BESTALLT units into Garage/);
  assert.match(migration, /Any failure rolls back the whole operation/);
});

test('atomic handoff is idempotent for active Planning units', () => {
  assert.match(migration, /source_planning_cell_id = d\.planning_cell_id/);
  assert.match(migration, /source_planning_unit_no = d\.unit_no/);
  assert.match(migration, /voided_at is null/);
  assert.match(migration, /on conflict \(source_planning_cell_id, source_planning_unit_no\)/);
  assert.match(migration, /do nothing/);
});

test('period-status API uses the atomic RPC for KLAR', () => {
  assert.match(route, /if \(status === 'KLAR'\)/);
  assert.match(route, /admin\.rpc\('finalize_planning_period_to_garage'/);
  assert.match(route, /Planeringen kunde inte markeras KLAR och skickas till Garaget/);
  assert.doesNotMatch(route, /materializePlanningToGarage/);
  assert.doesNotMatch(route, /Planeringen markerades KLAR men Garage-objekten kunde inte skapas automatiskt/);
});

test('atomic RPC is not callable by browser roles', () => {
  assert.match(migration, /revoke all on function public\.finalize_planning_period_to_garage\(text,uuid\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.finalize_planning_period_to_garage\(text,uuid\) to service_role/);
});
