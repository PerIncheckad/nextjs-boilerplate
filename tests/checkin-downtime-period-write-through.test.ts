import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260821153000_add_checkin_downtime_period_write_through.sql'),
  'utf8',
);

test('only explicit completed Check-in unavailability can establish DOWNTIME', () => {
  assert.match(migration, /p_status <> 'COMPLETED' or p_completed_at is null/i);
  assert.match(migration, /p_checklist ->> 'rental_unavailable'/i);
  assert.match(migration, /p_checklist ->> 'rental_unavailable_comment'/i);
  assert.match(migration, /transition_vehicle_journey_state[\s\S]*'DOWNTIME'/i);
  assert.match(migration, /'CHECKIN'[\s\S]*'checkins'/i);
  assert.doesNotMatch(migration, /transition_vehicle_journey_state[\s\S]{0,300}'AVAILABLE'/i);
  assert.doesNotMatch(migration, /transition_vehicle_journey_state[\s\S]{0,300}'RENTAL'/i);
});

test('normal completed Check-in leaves the open primary period untouched', () => {
  assert.match(migration, /v_unavailable := coalesce\(\(p_checklist ->> 'rental_unavailable'\)::boolean, false\);/i);
  assert.match(migration, /if not v_unavailable then\s+return true;/i);
  assert.match(migration, /when \(new\.status = 'COMPLETED' and new\.completed_at is not null\)/i);
});

test('explicit unavailable Check-in creates one idempotent DOWNTIME fact with source and reason', () => {
  assert.match(migration, /vehicle_journey_periods_checkin_unavailable_source_uidx/i);
  assert.match(migration, /where source_system = 'CHECKIN'[\s\S]*source_entity = 'checkins'[\s\S]*source_record_id = v_source_record_id/i);
  assert.match(migration, /perform public\.transition_vehicle_journey_state\([\s\S]*'DOWNTIME'[\s\S]*'OTHER'[\s\S]*v_reason_text[\s\S]*'CHECKIN'[\s\S]*'checkins'[\s\S]*v_source_record_id/i);
  assert.match(migration, /'sourceKind', 'CHECKIN_RENTAL_UNAVAILABLE'/i);
  assert.match(migration, /'sourceField', 'checklist\.rental_unavailable'/i);
});

test('explicit unavailable Check-in requires the operator comment', () => {
  assert.match(migration, /Check-in rental_unavailable requires an explicit comment before DOWNTIME can be established/i);
  assert.match(migration, /'OTHER',[\s\S]*v_reason_text/i);
});

test('existing DOWNTIME is continued and confirmed without splitting the open period', () => {
  assert.match(migration, /v_current\.period_type = 'DOWNTIME'/i);
  assert.match(migration, /'DOWNTIME_CONFIRMED'/i);
  assert.match(migration, /existingPeriodId/i);
  assert.match(migration, /on conflict \(event_key\) do nothing/i);
});

test('Check-in period adapter is fail-open and server-only', () => {
  assert.match(migration, /period_write_through_failures/i);
  assert.match(migration, /exception when others/i);
  assert.match(migration, /raise warning '\[period-write-through\] Check-in statement adapter failed:/i);
  assert.match(migration, /revoke all on function public\.try_write_through_checkin_downtime_period[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.try_write_through_checkin_downtime_period[\s\S]*to service_role/i);
});

test('migration performs no historical backfill and no unrelated state semantics', () => {
  assert.doesNotMatch(migration, /insert into public\.vehicle_journey_periods[\s\S]*select[\s\S]*from public\.checkins/i);
  assert.doesNotMatch(migration, /'SALU'/);
  assert.doesNotMatch(migration, /'AVAILABLE'/);
  assert.doesNotMatch(migration, /'RENTAL'/);
});
