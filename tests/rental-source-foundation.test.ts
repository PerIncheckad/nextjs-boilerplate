import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const migration = read('migrations/20260823012529_create_rental_source_foundation.sql');
const contract = read('docs/RENTAL_SOURCE_CONTRACT_V1.md');

test('rental source foundation stores one rich source once and exposes a bounded A-I projection', () => {
  assert.match(migration, /create table public\.rental_source_import_batches/i);
  assert.match(migration, /create table public\.rental_source_rows_raw/i);
  assert.match(migration, /raw_payload jsonb not null/i);
  assert.match(migration, /create table public\.rental_operational_facts/i);

  for (const column of [
    'close_month text',
    'station_no text',
    'out_station text',
    'close_year integer',
    'closed_date date',
    'agreement_no text not null',
    'out_at timestamptz not null',
    'in_at timestamptz',
    'regnr text not null',
  ]) {
    assert.match(migration, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('agreement identity, timestamp ordering and operational dedup are explicit', () => {
  assert.match(migration, /unique \(source_system, source_record_id\)/i);
  assert.match(migration, /check \(source_record_id = agreement_no\)/i);
  assert.match(migration, /check \(in_at is null or in_at >= out_at\)/i);
  assert.match(migration, /operational_hash text not null/i);
  assert.match(contract, /operational_hash.*only the Layer 1 projection/is);
});

test('source evidence is server-only and full RAW is preserved for later bounded projections', () => {
  for (const table of [
    'rental_source_import_batches',
    'rental_source_rows_raw',
    'rental_operational_facts',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.match(migration, /grant select, insert on public\.rental_source_rows_raw to service_role/i);
  assert.match(contract, /complete delivered row.*stored in `rental_source_rows_raw\.raw_payload`/is);
  assert.match(contract, /Kistan.*same RAW row/is);
});

test('Layer 1 contract keeps B and C as text and never uses E as RENTAL end', () => {
  assert.match(contract, /B and C are machine strings, not numbers/i);
  assert.match(contract, /E never ends RENTAL\. H ends RENTAL\./i);
  assert.match(contract, /G exists, H empty, E empty.*active RENTAL/is);
  assert.match(contract, /G \+ H exist, E empty.*returned/is);
  assert.match(contract, /G \+ H \+ E exist.*returned and the agreement is closed/is);
});

test('after H the source contract forbids AVAILABLE inference and invented timestamps', () => {
  assert.match(contract, /After H, INCHECKAD must not infer `AVAILABLE`/i);
  assert.match(contract, /operational read model must be `UNKNOWN`/i);
  assert.match(contract, /must not invent `00:00`/i);
});

test('foundation has no vehicle journey or Kistan write-through', () => {
  assert.doesNotMatch(migration, /insert into public\.vehicle_journey_periods/i);
  assert.doesNotMatch(migration, /update public\.vehicle_journey_periods/i);
  assert.doesNotMatch(migration, /insert into public\.vehicle_journey_events/i);
  assert.doesNotMatch(migration, /kistan/i);
  assert.match(contract, /does not:[\s\S]*create or close a `RENTAL` journey period/i);
  assert.match(contract, /does not:[\s\S]*implement Kistan/i);
});

test('machine report contract excludes human totals and footers', () => {
  assert.match(contract, /totals, subtotals, headings and footers are not source records/i);
});
