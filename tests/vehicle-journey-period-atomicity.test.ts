import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const periodApi = readFileSync(
  join(process.cwd(), 'app/api/vehicle-journey/periods/route.ts'),
  'utf8',
);

const foundationMigration = readFileSync(
  join(process.cwd(), 'migrations/20260820222728_atomic_vehicle_journey_period_events.sql'),
  'utf8',
);

const splitMigration = readFileSync(
  join(process.cwd(), 'migrations/20260821113000_split_vehicle_state_and_activity_periods.sql'),
  'utf8',
);

test('journey period API delegates primary transitions and activity periods to database RPCs', () => {
  assert.match(periodApi, /rpc\('transition_vehicle_journey_state'/);
  assert.match(periodApi, /rpc\('close_vehicle_journey_period'/);
  assert.match(periodApi, /rpc\('start_vehicle_journey_activity_period'/);
  assert.match(periodApi, /rpc\('close_vehicle_journey_activity_period'/);
  assert.doesNotMatch(periodApi, /from\('vehicle_journey_events'\)\.insert/);
  assert.doesNotMatch(periodApi, /from\('vehicle_journey_periods'\)\.insert/);
});

test('legacy period foundation remains atomic', () => {
  assert.match(foundationMigration, /function public\.start_vehicle_journey_period/i);
  assert.match(foundationMigration, /insert into public\.vehicle_journey_events/i);
  assert.match(foundationMigration, /'PERIOD_STARTED'/);
  assert.match(foundationMigration, /insert into public\.vehicle_journey_periods/i);
  assert.match(foundationMigration, /source_event_id/);
});

test('new time model allows one open primary state per vehicle', () => {
  assert.match(splitMigration, /vehicle_journey_periods_one_open_state_uidx/i);
  assert.match(splitMigration, /on public\.vehicle_journey_periods \(regnr\)/i);
  assert.match(splitMigration, /where ended_at is null/i);
  assert.match(splitMigration, /'PREPARATION', 'AVAILABLE', 'RENTAL', 'DOWNTIME', 'SALU', 'OTHER'/i);
  assert.doesNotMatch(splitMigration, /check \(period_type in \([^;]*'WORKSHOP'[^;]*\)\)/i);
});

test('transition RPC closes the previous state and starts the next at the same timestamp', () => {
  assert.match(splitMigration, /function public\.transition_vehicle_journey_state/i);
  assert.match(splitMigration, /set ended_at = p_started_at/i);
  assert.match(splitMigration, /'PERIOD_ENDED'/);
  assert.match(splitMigration, /'PERIOD_STARTED'/);
  assert.match(splitMigration, /transitionedTo/i);
});

test('workshop transport and waiting time are child activities under downtime', () => {
  assert.match(splitMigration, /create table public\.vehicle_journey_activity_periods/i);
  assert.match(splitMigration, /parent_period_id uuid not null references public\.vehicle_journey_periods/i);
  assert.match(splitMigration, /Journey activities require a DOWNTIME parent/i);
  assert.match(splitMigration, /'WORKSHOP'/);
  assert.match(splitMigration, /'WAITING_PARTS'/);
  assert.match(splitMigration, /'TRANSPORT'/);
  assert.match(splitMigration, /'ACTIVITY_PERIOD_STARTED'/);
  assert.match(splitMigration, /'ACTIVITY_PERIOD_ENDED'/);
});

test('closing downtime also closes open child activities', () => {
  assert.match(splitMigration, /if v_period\.period_type = 'DOWNTIME'/i);
  assert.match(splitMigration, /perform public\.close_vehicle_journey_activity_period/i);
});

test('time model migrations fail safe before reclassifying existing workshop or transport primary rows', () => {
  assert.match(splitMigration, /if exists[\s\S]*period_type in \('WORKSHOP', 'TRANSPORT'\)[\s\S]*raise exception/i);
});

test('time model RPCs remain service-role only', () => {
  assert.match(splitMigration, /revoke all on function public\.transition_vehicle_journey_state[\s\S]*from public, anon, authenticated/i);
  assert.match(splitMigration, /revoke all on function public\.start_vehicle_journey_activity_period[\s\S]*from public, anon, authenticated/i);
  assert.match(splitMigration, /grant execute on function public\.transition_vehicle_journey_state[\s\S]*to service_role/i);
  assert.match(splitMigration, /grant execute on function public\.start_vehicle_journey_activity_period[\s\S]*to service_role/i);
});
