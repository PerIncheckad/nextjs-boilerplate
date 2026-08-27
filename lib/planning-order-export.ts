export type PlanningOrderExportRow = {
  period: string;
  model: string;
  stationCode: string;
  stationName: string | null;
  orderedCount: number;
  note: string;
};

const EXCEL_HEADER = [
  'Planeringsmånad',
  'Beslut',
  'Modell',
  'Station',
  'Stationsnamn',
  'Antal',
  'Kommentar',
] as const;

function neutralizeSpreadsheetFormula(value: string) {
  const trimmed = value.trimStart();
  if (!trimmed || !/^[=+\-@]/.test(trimmed)) return value;
  const leadingWhitespace = value.slice(0, value.length - trimmed.length);
  return `${leadingWhitespace}'${trimmed}`;
}

function csvCell(value: string) {
  const safe = neutralizeSpreadsheetFormula(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildPlanningOrderExcelCsv(rows: PlanningOrderExportRow[]) {
  const exportRows = rows
    .filter((row) => Number.isInteger(row.orderedCount) && row.orderedCount > 0)
    .sort((left, right) => left.model.localeCompare(right.model, 'sv') || left.stationCode.localeCompare(right.stationCode, 'sv'));

  const lines = [
    'sep=;',
    EXCEL_HEADER.map(csvCell).join(';'),
    ...exportRows.map((row) => [
      csvCell(row.period),
      csvCell('BESTÄLLT'),
      csvCell(row.model),
      csvCell(row.stationCode),
      csvCell(row.stationName ?? ''),
      String(row.orderedCount),
      csvCell(row.note),
    ].join(';')),
  ];

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function planningOrderExportFilename(period: string) {
  const safePeriod = /^\d{4}-\d{2}$/.test(period) ? period : 'okand-period';
  return `incheckad-bestallt-${safePeriod}.csv`;
}
