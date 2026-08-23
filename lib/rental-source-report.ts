import { createHash } from 'node:crypto';

export const RENTAL_BASELINE_HEADERS = [
  'Avsl. Månad',
  'Stn',
  'Ut Stn',
  'Avsl. År',
  'Avsl. Datum',
  'AvtalsNr',
  'UtDt',
  'InDt',
  'RegNr',
  'Fordonstyp',
  'Debiterad Klass',
  'Uthyrd Klass',
  'Avtalstyp',
  'Prislista',
  'Företagsnamn',
  'Hyror',
  'S:a Intäkt',
  'S:a Hyra',
  'S:a Dagar',
  'Snitt Intäkt',
  'Snitt Hyra',
  'Driv medel',
  'S-Skydd Halv',
  'S-Skydd Hel',
  'Skade kostnad',
  'Tillval',
  'Avgifter',
  'Väg o Miljö',
  'Tillbeh.',
  'Bildeb',
  'Bildeb/ Hyra',
  'Marg. Hyra 3110',
  'Marg./ Dag 3110',
] as const;

export type RentalSourceRow = Record<string, string | null>;

export type RentalOperationalProjection = {
  closeMonth: string | null;
  stationNo: string | null;
  outStation: string | null;
  closeYear: number | null;
  closedDate: string | null;
  agreementNo: string;
  outAt: string;
  inAt: string | null;
  regnr: string;
};

export type ParsedRentalSourceRow = {
  sourceRowNumber: number;
  raw: RentalSourceRow;
  operational: RentalOperationalProjection;
};

export type ParsedRentalSourceReport = {
  delimiter: ',' | ';' | '\t';
  headers: string[];
  rows: ParsedRentalSourceRow[];
  sha256: string;
};

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const ISO_TIMESTAMP_WITH_TIMEZONE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function trimOrNull(value: string | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : normalized;
}

function normalizeRegnr(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

function assertSourceTimestamp(value: string, field: 'UtDt' | 'InDt', rowNumber: number): string {
  if (!ISO_TIMESTAMP_WITH_TIMEZONE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(
      `Rad ${rowNumber}: ${field} måste vara ISO 8601 med verklig tid och tidszon, t.ex. 2026-08-23T10:15:00+02:00`,
    );
  }
  return value;
}

function parseCloseYear(value: string | null, rowNumber: number): number | null {
  if (value === null) return null;
  if (!/^\d{4}$/.test(value)) {
    throw new Error(`Rad ${rowNumber}: Avsl. År måste vara fyrsiffrigt år eller tomt`);
  }
  return Number(value);
}

function parseClosedDate(value: string | null, rowNumber: number): string | null {
  if (value === null) return null;
  if (ISO_DATE_RE.test(value)) return value;
  if (ISO_TIMESTAMP_WITH_TIMEZONE_RE.test(value) && !Number.isNaN(Date.parse(value))) {
    return value.slice(0, 10);
  }
  throw new Error(`Rad ${rowNumber}: Avsl. Datum måste vara ISO-datum eller ISO-timestamp med tidszon`);
}

function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstRecordEnd = (() => {
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') {
          i += 1;
          continue;
        }
        quoted = !quoted;
      } else if (!quoted && (char === '\n' || char === '\r')) {
        return i;
      }
    }
    return text.length;
  })();

  const header = text.slice(0, firstRecordEnd);
  const candidates: Array<[',' | ';' | '\t', number]> = [
    [',', header.split(',').length],
    [';', header.split(';').length],
    ['\t', header.split('\t').length],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  if (candidates[0][1] < 2) {
    throw new Error('Maskinrapporten saknar ett tydligt CSV/TSV-avgränsningstecken');
  }
  return candidates[0][0];
}

export function parseDelimited(text: string, delimiter: ',' | ';' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error('Maskinrapporten innehåller ett oavslutat citerat fält');
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

export function parseRentalSourceReport(input: Uint8Array): ParsedRentalSourceReport {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    throw new Error('Maskinrapporten måste vara UTF-8');
  }
  text = text.replace(/^\uFEFF/, '');
  if (text.trim() === '') throw new Error('Maskinrapporten är tom');

  const delimiter = detectDelimiter(text);
  const records = parseDelimited(text, delimiter);
  if (records.length < 2) throw new Error('Maskinrapporten innehåller inga datarader');

  const headers = records[0].map((value) => value.trim());
  if (new Set(headers).size !== headers.length) {
    throw new Error('Maskinrapporten innehåller dubbla kolumnrubriker');
  }
  const missing = RENTAL_BASELINE_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new Error(`Maskinrapporten saknar obligatoriska kolumner: ${missing.join(', ')}`);
  }

  const agreementNos = new Set<string>();
  const rows = records.slice(1).map((values, index): ParsedRentalSourceRow => {
    const rowNumber = index + 2;
    if (values.length !== headers.length) {
      throw new Error(`Rad ${rowNumber}: ${values.length} fält men headern har ${headers.length}`);
    }

    const raw: RentalSourceRow = {};
    headers.forEach((header, columnIndex) => {
      const value = values[columnIndex];
      raw[header] = value === '' ? null : value;
    });

    const agreementNo = trimOrNull(raw.AvtalsNr ?? undefined);
    const outAtRaw = trimOrNull(raw.UtDt ?? undefined);
    const inAtRaw = trimOrNull(raw.InDt ?? undefined);
    const regnrRaw = trimOrNull(raw.RegNr ?? undefined);

    if (!agreementNo) throw new Error(`Rad ${rowNumber}: AvtalsNr saknas`);
    if (/^total$/i.test(agreementNo)) throw new Error(`Rad ${rowNumber}: Total-rad får inte finnas i maskinrapporten`);
    if (agreementNos.has(agreementNo)) throw new Error(`Rad ${rowNumber}: dubbelt AvtalsNr ${agreementNo}`);
    agreementNos.add(agreementNo);

    if (!outAtRaw) throw new Error(`Rad ${rowNumber}: UtDt saknas`);
    const outAt = assertSourceTimestamp(outAtRaw, 'UtDt', rowNumber);
    const inAt = inAtRaw ? assertSourceTimestamp(inAtRaw, 'InDt', rowNumber) : null;
    if (inAt && Date.parse(inAt) < Date.parse(outAt)) {
      throw new Error(`Rad ${rowNumber}: InDt ligger före UtDt`);
    }

    if (!regnrRaw) throw new Error(`Rad ${rowNumber}: RegNr saknas`);
    const regnr = normalizeRegnr(regnrRaw);
    if (!REGNR_RE.test(regnr)) throw new Error(`Rad ${rowNumber}: ogiltigt RegNr ${regnrRaw}`);

    return {
      sourceRowNumber: rowNumber,
      raw,
      operational: {
        closeMonth: trimOrNull(raw['Avsl. Månad'] ?? undefined),
        stationNo: trimOrNull(raw.Stn ?? undefined),
        outStation: trimOrNull(raw['Ut Stn'] ?? undefined),
        closeYear: parseCloseYear(trimOrNull(raw['Avsl. År'] ?? undefined), rowNumber),
        closedDate: parseClosedDate(trimOrNull(raw['Avsl. Datum'] ?? undefined), rowNumber),
        agreementNo,
        outAt,
        inAt,
        regnr,
      },
    };
  });

  return {
    delimiter,
    headers,
    rows,
    sha256: createHash('sha256').update(input).digest('hex'),
  };
}
