import { ANALYTICS_TIMEZONE, INTERVAL_SEMANTICS, stockholmLocalToEpochMs } from '@/lib/analytics/time';

export type InsightLocalPeriod = {
  startDate: string;
  endDateExclusive: string;
  localCalendarDays: number;
};

export type InsightCanonicalPeriod = {
  start: string;
  end: string;
  timezone: typeof ANALYTICS_TIMEZONE;
  intervalSemantics: typeof INTERVAL_SEMANTICS;
};

export type InsightCheckinPeriods = {
  selectedLocal: InsightLocalPeriod;
  selectedCanonical: InsightCanonicalPeriod;
  comparisonLocal: InsightLocalPeriod;
  comparisonCanonical: InsightCanonicalPeriod;
};

type ParsedDate = { year: number; month: number; day: number };

export class InsightPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsightPeriodError';
  }
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parseLocalDate(value: string): ParsedDate {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new InsightPeriodError('Period dates must use YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    throw new InsightPeriodError('Period contains an invalid calendar date');
  }
  return { year, month, day };
}

function dateOrdinal(value: ParsedDate): number {
  return Math.floor(Date.UTC(value.year, value.month - 1, value.day) / DAY_MS);
}

function formatLocalDate(value: ParsedDate): string {
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function shiftCalendarDays(value: ParsedDate, days: number): ParsedDate {
  const shifted = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function stockholmToday(now: Date): ParsedDate {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ANALYTICS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day };
}

function canonicalPeriod(start: ParsedDate, endExclusive: ParsedDate): InsightCanonicalPeriod {
  return {
    start: new Date(stockholmLocalToEpochMs(start)).toISOString(),
    end: new Date(stockholmLocalToEpochMs(endExclusive)).toISOString(),
    timezone: ANALYTICS_TIMEZONE,
    intervalSemantics: INTERVAL_SEMANTICS,
  };
}

export function resolveInsightCheckinPeriods(
  startDate: string,
  endDateExclusive: string,
  now = new Date(),
): InsightCheckinPeriods {
  const selectedStart = parseLocalDate(startDate);
  const selectedEnd = parseLocalDate(endDateExclusive);
  const startOrdinal = dateOrdinal(selectedStart);
  const endOrdinal = dateOrdinal(selectedEnd);
  const localCalendarDays = endOrdinal - startOrdinal;

  if (localCalendarDays < 1) throw new InsightPeriodError('Period must contain at least one local calendar day');
  if (localCalendarDays > 31) throw new InsightPeriodError('Period may contain at most 31 local calendar days');

  const today = stockholmToday(now);
  if (endOrdinal > dateOrdinal(today)) {
    throw new InsightPeriodError('Period must be fully completed in Europe/Stockholm');
  }

  const comparisonStart = shiftCalendarDays(selectedStart, -localCalendarDays);
  const comparisonEnd = selectedStart;

  return {
    selectedLocal: { startDate, endDateExclusive, localCalendarDays },
    selectedCanonical: canonicalPeriod(selectedStart, selectedEnd),
    comparisonLocal: {
      startDate: formatLocalDate(comparisonStart),
      endDateExclusive: formatLocalDate(comparisonEnd),
      localCalendarDays,
    },
    comparisonCanonical: canonicalPeriod(comparisonStart, comparisonEnd),
  };
}
