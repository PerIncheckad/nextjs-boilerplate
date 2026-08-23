import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260823104500_add_rental_period_write_through_v1.sql'),
  'utf8',
);

test('RENTAL journey identity is unique per upstream source agreement', () => {
  assert.match(migration, /vehicle_journey_periods_rental_source_uidx/i);
  assert.match(migration, /on public\.vehicle_journey_periods \(source_system, source_record_id\)/i);
  assert.match(migration, /period_type = 'RENTAL'/i);
  assert.match(migration, /source_entity = 'rental_operational_facts'/i);
});

test('database boundary makes G the only permitted RENTAL start and H the only permitted RENTAL end', () => {
  assert.match(migration, /guard_rental_period_source_ownership/i);
  assert.match(migration, /RENTAL may only be started by G \/ UtDt from rental_operational_facts/i);
  assert.match(migration, /RENTAL may only be ended once by H \/ InDt from its rental source/i);
  assert.match(migration, /incheckad\.rental_start_source_key/i);
  assert.match(migration, /incheckad\.rental_close_period_id/i);
  assert.match(migration, /before insert on public\.vehicle_journey_periods/i);
  assert.match(migration, /before update on public\.vehicle_journey_periods/i);
});

test('G opens active RENTAL through the existing atomic transition engine', () => {
  assert.match(migration, /perform public\.transition_vehicle_journey_state\([\s\S]*'RENTAL'[\s\S]*v_fact\.out_at/i);
  assert.match(migration, /'sourceField', 'G\/UtDt'/i);
  assert.match(migration, /'rental_operational_facts'/i);
  assert.match(migration, /'EXTERNAL'/i);
});

test('H closes the matching source-owned RENTAL and never creates AVAILABLE', () => {
  assert.match(migration, /close_rental_period_from_source/i);
  assert.match(migration, /set ended_at = p_ended_at/i);
  assert.match(migration, /'sourceField', 'H\/InDt'/i);
  assert.doesNotMatch(migration, /'AVAILABLE'/i);
  assert.doesNotMatch(migration, /transition_vehicle_journey_state\([\s\S]*p_ended_at/i);
});

test('E and A-D are not vehicle-state signals', () => {
  assert.match(migration, /E \/ Avsl\. Datum, A-D and other non-G\/H\/I changes are not vehicle-state/i);
  assert.match(migration, /old\.out_at is not distinct from new\.out_at/i);
  assert.match(migration, /old\.in_at is not distinct from new\.in_at/i);
  assert.match(migration, /old\.regnr is not distinct from new\.regnr/i);
  assert.doesNotMatch(migration, /old\.closed_date is distinct from new\.closed_date/i);
});

test('first-seen G+H is historical closed RENTAL and may not overlap verified journey time', () => {
  assert.match(migration, /insert_closed_rental_period_from_source/i);
  assert.match(migration, /Historical RENTAL overlaps existing verified vehicle journey time/i);
  assert.match(migration, /historicalClosedRental/i);
  assert.match(migration, /started_at < p_ended_at[\s\S]*ended_at is null or ended_at > p_started_at/i);
});

test('source corrections never silently rewrite G H or vehicle identity', () => {
  assert.match(migration, /Existing RENTAL vehicle identity conflicts with I \/ RegNr/i);
  assert.match(migration, /Existing RENTAL G \/ UtDt cannot be rewritten silently/i);
  assert.match(migration, /Closed RENTAL cannot be reopened by removing H \/ InDt/i);
  assert.match(migration, /Closed RENTAL H \/ InDt cannot be rewritten silently/i);
  assert.match(migration, /RENTAL period identity and G \/ UtDt are immutable/i);
});

test('active RENTAL refuses chronology conflicts instead of rewriting later history', () => {
  assert.match(migration, /Active RENTAL G \/ UtDt predates the current verified state/i);
  assert.match(migration, /Active RENTAL overlaps existing verified vehicle journey history/i);
  assert.match(migration, /Vehicle already has another open RENTAL source record/i);
});

test('rental write-through is fail-open, durable and replayable', () => {
  assert.match(migration, /period_write_through_failures/i);
  assert.match(migration, /source_entity = 'rental_operational_facts'/i);
  assert.match(migration, /target_state[\s\S]*RENTAL_ENDED/i);
  assert.match(migration, /exception when others[\s\S]*return false/i);
  assert.match(migration, /replay_rental_period_write_through/i);
});

test('all RENTAL write functions remain service-role only', () => {
  for (const fn of [
    'guard_rental_period_source_ownership',
    'close_rental_period_from_source',
    'insert_closed_rental_period_from_source',
    'try_write_through_rental_period',
    'write_through_rental_period',
    'replay_rental_period_write_through',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*from public, anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to service_role`, 'i'));
  }
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog/i);
});
