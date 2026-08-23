import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260823111500_add_post_rental_source_replay_v1.sql'),
  'utf8',
);

test('Check-in gets an explicit service-side replay path', () => {
  assert.match(migration, /function public\.replay_checkin_downtime_period_write_through/i);
  assert.match(migration, /try_write_through_checkin_downtime_period/i);
  assert.match(migration, /source_entity = 'checkins'/i);
  assert.match(migration, /resolved_at = coalesce\(resolved_at, pg_catalog\.now\(\)\)/i);
});

test('deferred replay only considers verified source facts strictly after H', () => {
  assert.match(migration, /edit\.edited_at > p_returned_at/i);
  assert.match(migration, /checkin\.completed_at > p_returned_at/i);
  assert.match(migration, /edit\.field_name = 'klar_for_uthyrning'/i);
  assert.match(migration, /checkin\.status = 'COMPLETED'/i);
  assert.doesNotMatch(migration, />= p_returned_at/i);
});

test('deferred facts replay in chronology and exact timestamp ties do not invent source precedence', () => {
  assert.match(migration, /count\(\*\) over \(partition by occurred_at\) as same_timestamp_count/i);
  assert.match(migration, /order by occurred_at, source_entity, source_record_id/i);
  assert.match(migration, /if v_candidate\.same_timestamp_count > 1 then[\s\S]*continue/i);
  assert.match(migration, /'ambiguous', v_ambiguous/i);
});

test('replay reuses authoritative Status and Check-in write-through functions', () => {
  assert.match(migration, /replay_vehicle_status_period_write_through/i);
  assert.match(migration, /replay_checkin_downtime_period_write_through/i);
  assert.doesNotMatch(migration, /insert into public\.vehicle_journey_periods/i);
  assert.doesNotMatch(migration, /update public\.vehicle_journey_periods[\s\S]*set ended_at/i);
});

test('H closes first and post-return replay is fail-open', () => {
  assert.match(migration, /after update of ended_at on public\.vehicle_journey_periods/i);
  assert.match(migration, /old\.period_type = 'RENTAL'/i);
  assert.match(migration, /old\.ended_at is null/i);
  assert.match(migration, /new\.ended_at is not null/i);
  assert.match(migration, /new\.source_entity = 'rental_operational_facts'/i);
  assert.match(migration, /exception when others[\s\S]*raise warning '\[post-rental-replay\] Trigger failed/i);
  assert.match(migration, /return new/i);
});

test('replay remains server-role only', () => {
  for (const fn of [
    'replay_checkin_downtime_period_write_through',
    'replay_deferred_vehicle_state_after_rental',
    'replay_deferred_vehicle_state_after_rental_trigger',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*from public, anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to service_role`, 'i'));
  }
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog/i);
});
