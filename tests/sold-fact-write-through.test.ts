import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260821151500_add_sold_fact_write_through.sql'),
  'utf8',
);

test('sale status writes append-only sold fact without inventing a SALU or rental period', () => {
  assert.match(migration, /VEHICLE_SOLD_RECORDED/);
  assert.match(migration, /VEHICLE_SOLD_CORRECTED/);
  assert.match(migration, /insert into public\.vehicle_journey_events/i);
  assert.doesNotMatch(migration, /transition_vehicle_journey_state/i);
  assert.doesNotMatch(migration, /'RENTAL'/);
  assert.doesNotMatch(migration, /'SALU'/);
});

test('sold date is retained as a business date while event time is the recording timestamp', () => {
  assert.match(migration, /'soldDate',v_sold_date/i);
  assert.match(migration, /'recordedAt',coalesce\(p_edited_at, pg_catalog\.now\(\)\)/i);
  assert.match(migration, /'soldDateHasNoTime',v_sold_date is not null/i);
});

test('unmark sold is a correcting event linked to latest sold fact', () => {
  assert.match(migration, /correction_of_event_id/i);
  assert.match(migration, /event_type = 'VEHICLE_SOLD_RECORDED'/i);
  assert.match(migration, /v_new_value = 'false'/i);
});

test('sale fact requires same-batch comment and optional sold date', () => {
  assert.match(migration, /field_name = 'sold_kommentar'/i);
  assert.match(migration, /field_name = 'sold_datum'/i);
  assert.match(migration, /batch_id is not distinct from v_edit\.batch_id/i);
  assert.match(migration, /if v_comment is null then return false/i);
});

test('write-through is fail-open and server controlled', () => {
  assert.match(migration, /journey_event_write_through_failures/i);
  assert.match(migration, /exception when others then[\s\S]*return false/i);
  assert.match(migration, /after insert on public\.vehicle_edits/i);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog/i);
  assert.match(migration, /revoke all on function public\.try_write_through_sold_fact[\s\S]*from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.try_write_through_sold_fact[\s\S]*to service_role/i);
});
