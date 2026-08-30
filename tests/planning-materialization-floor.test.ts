import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync('app/api/fleet-planning/route.ts', 'utf8');
const migration = readFileSync('migrations/20260830151000_planning_materialization_floor.sql', 'utf8');

test('fleet-planning rejects BESTALLT below active materialized Garage units', () => {
  assert.match(route, /source_kind', 'PLANERING'/);
  assert.match(route, /is\('voided_at', null\)/);
  assert.match(route, /orderedCount < activeMaterialized/);
  assert.match(route, /BESTÄLLT kan inte sänkas/);
  assert.match(route, /status: 409/);
});

test('database trigger enforces the same materialization floor', () => {
  assert.match(migration, /create or replace function public\.enforce_planning_materialization_floor/);
  assert.match(migration, /gi\.source_kind = 'PLANERING'/);
  assert.match(migration, /gi\.voided_at is null/);
  assert.match(migration, /new\.ordered_count < v_active_materialized/);
  assert.match(migration, /using errcode = '23514'/);
  assert.match(migration, /before update of ordered_count on public\.fleet_planning_cells/);
});
