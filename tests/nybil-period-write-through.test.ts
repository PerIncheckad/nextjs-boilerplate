import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260821144700_add_nybil_period_write_through.sql'),
  'utf8',
);

test('Nybil baseline maps explicit readiness only to AVAILABLE or PREPARATION', () => {
  assert.match(migration, /true\s*=> AVAILABLE/i);
  assert.match(migration, /false => PREPARATION/i);
  assert.match(migration, /v_target_state := case when p_ready then 'AVAILABLE' else 'PREPARATION' end/i);
  assert.doesNotMatch(migration, /p_ready[^;]*(?:then|else) 'RENTAL'/i);
  assert.doesNotMatch(migration, /p_ready[^;]*(?:then|else) 'DOWNTIME'/i);
});

test('Nybil baseline is insert-only and never overwrites an existing open operational state', () => {
  assert.match(migration, /after insert on public\.nybil_inventering/i);
  assert.match(migration, /where regnr = v_regnr\s*and ended_at is null/i);
  assert.match(migration, /return true;[\s\S]*perform public\.transition_vehicle_journey_state/i);
});

test('duplicate or unresolved Nybil rows do not create primary time facts', () => {
  assert.match(migration, /coalesce\(p_is_duplicate, false\)[\s\S]*return true/i);
  assert.match(migration, /if p_ready is null then\s*return true/i);
});

test('Nybil source identity is idempotent and uses shared durable failure logging', () => {
  assert.match(migration, /vehicle_journey_periods_nybil_source_uidx/i);
  assert.match(migration, /source_system = 'NYBIL'/i);
  assert.match(migration, /source_entity = 'nybil_inventering'/i);
  assert.match(migration, /period_write_through_failures/i);
  assert.match(migration, /on conflict \(source_entity, source_record_id\)/i);
});

test('Nybil adapter remains fail-open and server-controlled', () => {
  assert.match(migration, /exception when others[\s\S]*return new/i);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog/i);
  assert.match(migration, /revoke all on function public\.try_write_through_nybil_period[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.try_write_through_nybil_period[\s\S]*to service_role/i);
});
