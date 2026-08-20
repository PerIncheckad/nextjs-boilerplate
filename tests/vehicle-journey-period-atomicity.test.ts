import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const periodApi = readFileSync(
  join(process.cwd(), 'app/api/vehicle-journey/periods/route.ts'),
  'utf8',
);

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260821002000_atomic_vehicle_journey_period_events.sql'),
  'utf8',
);

test('journey period API delegates start and close to atomic database RPCs', () => {
  assert.match(periodApi, /rpc\('start_vehicle_journey_period'/);
  assert.match(periodApi, /rpc\('close_vehicle_journey_period'/);
  assert.doesNotMatch(periodApi, /from\('vehicle_journey_events'\)\.insert/);
  assert.doesNotMatch(periodApi, /from\('vehicle_journey_periods'\)\.insert/);
});

test('start RPC writes start event and period in one database function', () => {
  assert.match(migration, /function public\.start_vehicle_journey_period/i);
  assert.match(migration, /insert into public\.vehicle_journey_events/i);
  assert.match(migration, /'PERIOD_STARTED'/);
  assert.match(migration, /insert into public\.vehicle_journey_periods/i);
  assert.match(migration, /source_event_id/);
  assert.match(migration, /v_event_id/);
});

test('close RPC locks the period and appends the end event transactionally', () => {
  assert.match(migration, /function public\.close_vehicle_journey_period/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /update public\.vehicle_journey_periods/i);
  assert.match(migration, /'PERIOD_ENDED'/);
  assert.match(migration, /End time cannot be before start time/);
});

test('database prevents duplicate open periods of the same type under concurrency', () => {
  assert.match(migration, /create unique index if not exists vehicle_journey_periods_one_open_type_uidx/i);
  assert.match(migration, /on public\.vehicle_journey_periods \(regnr, period_type\)/i);
  assert.match(migration, /where ended_at is null/i);
});

test('atomic period RPCs remain service-role only', () => {
  assert.match(migration, /revoke all on function public\.start_vehicle_journey_period[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.close_vehicle_journey_period[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.start_vehicle_journey_period[\s\S]*to service_role/i);
  assert.match(migration, /grant execute on function public\.close_vehicle_journey_period[\s\S]*to service_role/i);
});
