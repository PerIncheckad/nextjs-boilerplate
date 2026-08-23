import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RENTAL_BASELINE_HEADERS,
  parseRentalSourceReport,
} from '../lib/rental-source-report';

function csvCell(value: string): string {
  if (/[",;\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function buildRow(overrides: Record<string, string> = {}, extra: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    'Avsl. Månad': '',
    Stn: '0166',
    'Ut Stn': '0170',
    'Avsl. År': '',
    'Avsl. Datum': '',
    AvtalsNr: '024-166-0006155',
    UtDt: '2026-08-23T08:15:00+02:00',
    InDt: '',
    RegNr: 'ABC12D',
    Fordonstyp: 'Personbil',
    'Debiterad Klass': 'A',
    'Uthyrd Klass': 'A',
    Avtalstyp: 'Företag',
    Prislista: 'PL1',
    Företagsnamn: 'Kund AB',
    Hyror: '1',
    'S:a Intäkt': '1250,50',
    'S:a Hyra': '1000,00',
    'S:a Dagar': '1',
    'Snitt Intäkt': '1250,50',
    'Snitt Hyra': '1000,00',
    'Driv medel': '0',
    'S-Skydd Halv': '0',
    'S-Skydd Hel': '0',
    'Skade kostnad': '0',
    Tillval: '0',
    Avgifter: '0',
    'Väg o Miljö': '0',
    'Tillbeh.': '0',
    Bildeb: '450',
    'Bildeb/ Hyra': '450',
    'Marg. Hyra 3110': '550',
    'Marg./ Dag 3110': '550',
  };
  return { ...defaults, ...overrides, ...extra };
}

function report(rows: Array<Record<string, string>>, extraHeaders: string[] = []): Uint8Array {
  const headers = [...RENTAL_BASELINE_HEADERS, ...extraHeaders];
  const lines = [
    headers.map(csvCell).join(';'),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? '')).join(';')),
  ];
  return new TextEncoder().encode(lines.join('\r\n'));
}

test('parses the complete rich source and projects only A-I operational fields', () => {
  const parsed = parseRentalSourceReport(report([
    buildRow({}, { 'Framtida ekonomifält': '999' }),
  ], ['Framtida ekonomifält']));

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].operational.agreementNo, '024-166-0006155');
  assert.equal(parsed.rows[0].operational.stationNo, '0166');
  assert.equal(parsed.rows[0].operational.outStation, '0170');
  assert.equal(parsed.rows[0].operational.outAt, '2026-08-23T08:15:00+02:00');
  assert.equal(parsed.rows[0].operational.inAt, null);
  assert.equal(parsed.rows[0].raw['S:a Intäkt'], '1250,50');
  assert.equal(parsed.rows[0].raw['Framtida ekonomifält'], '999');
  assert.ok(parsed.sha256.length === 64);
});

test('accepts H and E without giving E control over RENTAL timing', () => {
  const parsed = parseRentalSourceReport(report([
    buildRow({
      'Avsl. Månad': '08',
      'Avsl. År': '2026',
      'Avsl. Datum': '2026-08-23T12:30:00+02:00',
      InDt: '2026-08-23T10:45:00+02:00',
    }),
  ]));

  assert.equal(parsed.rows[0].operational.inAt, '2026-08-23T10:45:00+02:00');
  assert.equal(parsed.rows[0].operational.closedDate, '2026-08-23');
});

test('rejects date-only G because source time may not be invented', () => {
  assert.throws(
    () => parseRentalSourceReport(report([buildRow({ UtDt: '2026-08-23' })])),
    /UtDt måste vara ISO 8601 med verklig tid och tidszon/,
  );
});

test('rejects date-only H because source time may not be invented', () => {
  assert.throws(
    () => parseRentalSourceReport(report([buildRow({ InDt: '2026-08-23' })])),
    /InDt måste vara ISO 8601 med verklig tid och tidszon/,
  );
});

test('rejects duplicate F before any database write can begin', () => {
  assert.throws(
    () => parseRentalSourceReport(report([
      buildRow(),
      buildRow({ RegNr: 'DEF34G' }),
    ])),
    /dubbelt AvtalsNr/,
  );
});

test('rejects Total presentation rows', () => {
  assert.throws(
    () => parseRentalSourceReport(report([buildRow({ AvtalsNr: 'Total' })])),
    /Total-rad får inte finnas/,
  );
});

test('rejects incomplete 33-field machine contract', () => {
  const headers = RENTAL_BASELINE_HEADERS.filter((header) => header !== 'S:a Intäkt');
  const row = buildRow();
  const bytes = new TextEncoder().encode([
    headers.join(';'),
    headers.map((header) => row[header] ?? '').join(';'),
  ].join('\n'));

  assert.throws(() => parseRentalSourceReport(bytes), /saknar obligatoriska kolumner: S:a Intäkt/);
});

test('bulk RPC remains service-role-only and bounded to 250 rows', () => {
  const migration = readFileSync(
    join(process.cwd(), 'migrations/20260823123000_add_rental_source_bulk_ingestion_v1.sql'),
    'utf8',
  );
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = pg_catalog/i);
  assert.match(migration, /jsonb_array_length\(p_rows\) > 250/i);
  assert.match(migration, /public\.ingest_rental_source_row/i);
  assert.match(migration, /revoke all on function public\.ingest_rental_source_rows[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.ingest_rental_source_rows[\s\S]*service_role/i);
});

test('HTTP import is deny-by-default and uses authenticated server API boundary', () => {
  const route = readFileSync(
    join(process.cwd(), 'app/api/rental-source/import/route.ts'),
    'utf8',
  );
  assert.match(route, /verifyApiUser\(request\)/);
  assert.match(route, /RENTAL_IMPORT_ALLOWED_EMAILS/);
  assert.match(route, /allowedEmails\.size === 0/);
  assert.match(route, /ingest_rental_source_rows/);
  assert.match(route, /SOURCE_CONFLICTS/);
  assert.doesNotMatch(route, /AVAILABLE/);
  assert.doesNotMatch(route, /Kistan/i);
});
