import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260823103000_add_rental_source_ingestion_v1.sql'),
  'utf8',
);

test('rental ingestion is server-only and transport independent', () => {
  assert.match(migration, /function public\.create_rental_source_import_batch/i);
  assert.match(migration, /function public\.ingest_rental_source_row/i);
  assert.match(migration, /p_raw_payload jsonb/i);
  assert.doesNotMatch(migration, /csv|xlsx|excel/i);
  assert.match(migration, /revoke all on function public\.ingest_rental_source_row[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.ingest_rental_source_row[\s\S]*to service_role/i);
});

test('import batch identity is idempotent and requires a file hash', () => {
  assert.match(migration, /Rental source file hash is required for idempotent import/i);
  assert.match(migration, /on conflict \(source_system, source_file_hash\)[\s\S]*do nothing/i);
  assert.match(migration, /where source_system = v_source_system[\s\S]*source_file_hash = v_source_file_hash/i);
});

test('complete RAW row is immutable inside a known batch', () => {
  assert.match(migration, /rental_source_rows_raw_batch_record_uidx/i);
  assert.match(migration, /md5\(p_raw_payload::text\)/i);
  assert.match(migration, /on conflict \(batch_id, source_record_id\) do nothing/i);
  assert.match(migration, /Immutable source row changed inside existing import batch/i);
  assert.doesNotMatch(migration, /update public\.rental_source_rows_raw/i);
});

test('Layer 1 projection is exactly A-I and preserves source semantics', () => {
  for (const parameter of [
    'p_close_month text',
    'p_station_no text',
    'p_out_station text',
    'p_close_year integer',
    'p_closed_date date',
    'p_agreement_no text',
    'p_out_at timestamptz',
    'p_in_at timestamptz',
    'p_regnr text',
  ]) {
    assert.match(migration, new RegExp(parameter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.match(migration, /F \/ AvtalsNr must equal source_record_id/i);
  assert.match(migration, /G \/ UtDt with source-known time is required/i);
  assert.match(migration, /H \/ InDt cannot be before G \/ UtDt/i);
  assert.match(migration, /I \/ RegNr is required/i);
});

test('canonical fact upsert is idempotent and economic RAW changes cannot directly write journey state', () => {
  assert.match(migration, /on conflict \(source_system, source_record_id\)[\s\S]*do update set/i);
  assert.match(migration, /operational_hash = excluded\.operational_hash/i);
  assert.match(migration, /last_seen_at = pg_catalog\.now\(\)/i);
  assert.doesNotMatch(migration, /vehicle_journey_periods/i);
  assert.doesNotMatch(migration, /vehicle_journey_events/i);
  assert.doesNotMatch(migration, /transition_vehicle_journey_state/i);
});

test('ingestion never invents timestamps or AVAILABLE state', () => {
  assert.match(migration, /if p_out_at is null then[\s\S]*raise exception/i);
  assert.doesNotMatch(migration, /coalesce\(p_out_at,\s*pg_catalog\.now/i);
  assert.doesNotMatch(migration, /'AVAILABLE'/i);
});
