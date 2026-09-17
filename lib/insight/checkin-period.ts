import { resolveStockholmDay } from '@/lib/analytics/time';

export const INSIGHT_CHECKIN_MIN_LOCAL_DAYS = 1;
export const INSIGHT_CHECKIN_MAX_LOCAL_DAYS = 31;

export type LocalDateString = `${number}-${number}-${number}`;

export type InsightCheckinResolvedPeriod = {
  local: {
    startDate: string;
    endDateExclusive: string;
    localDayCount: number;
  };
  canonical: {
    start: string;
    end: string;
    timezone: 'Europe/Stockholm';
    intervalSemantics: '[start,end)';
  };
};

export type InsightCheckinPeriodPair = {
  selected: InsightCheckinResolvedPeriod;
  comparison: InsightCheckinResolvedPeriod;
};

export class InsightCheckinPeriodError extends Error {
  constructor(
    readonly code:
      | 'INVALID_DATE'
      | 'INVALID_RANGE'
      | 'PERIOD_TOO_LONG'
      | 'PERIOD_NOT_COMPLETED',
    message: string,
  ) {
    super(message);
    this.name = 'InsightCheckinPeriodError';
  }
}

type DateParts = { year: number; month: number; day: number };

const STOCKHOLM_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function parseLocalDate(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new InsightCheckinPeriodError('INVALID_DATE', 'Date must use YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    throw new InsightCheckinPeriodError('INVALID_DATE', `Invalid calendar date: ${value}`);
  }
  return { year, month, day };
}

function dateSerial(parts: DateParts): number {
  return Math.trunc(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

function fromSerial(serial: number): DateParts {
  const date = new Date(serial * 86_400_000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function formatLocalDate(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function stockholmToday(now: Date): string {
  const parts = Object.fromEntries(
    STOCKHOLM_DATE_FORMATTER.formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function resolveCanonical(start: DateParts, endExclusive: DateParts) {
  const startBoundary = resolveStockholmDay(start.year, start.month, start.day).start;
  const endBoundary = resolveStockholmDay(endExclusive.year, endExclusive.month, endExclusive.day).start;
  return {
    start: startBoundary,
    end: endBoundary,
    timezone: 'Europe/Stockholm' as const,
    intervalSemantics: '[start,end)' as const,
  };
}

export function resolveInsightCheckinPeriods(
  input: { startDate: string; endDateExclusive: string },
  now = new Date(),
): InsightCheckinPeriodPair {
  const start = parseLocalDate(input.startDate);
  const endExclusive = parseLocalDate(input.endDateExclusive);
  const startSerial = dateSerial(start);
  const endSerial = dateSerial(endExclusive);
  const localDayCount = endSerial - startSerial;

  if (localDayCount < INSIGHT_CHECKIN_MIN_LOCAL_DAYS) {
    throw new InsightCheckinPeriodError('INVALID_RANGE', 'startDate must be before endDateExclusive');
  }
  if (localDayCount > INSIGHT_CHECKIN_MAX_LOCAL_DAYS) {
    throw new InsightCheckinPeriodError('PERIOD_TOO_LONG', `Selected period may contain at most ${INSIGHT_CHECKIN_MAX_LOCAL_DAYS} local calendar days`);
  }

  const today = parseLocalDate(stockholmToday(now));
  if (endSerial > dateSerial(today)) {
    throw new InsightCheckinPeriodError('PERIOD_NOT_COMPLETED', 'Selected period must be fully completed in Europe/Stockholm');
  }

  const comparisonStart = fromSerial(startSerial - localDayCount);
  const comparisonEnd = start;

  return {
    selected: {
      local: { startDate: formatLocalDate(start), endDateExclusive: formatLocalDate(endExclusive), localDayCount },
      canonical: resolveCanonical(start, endExclusive),
    },
    comparison: {
      local: { startDate: formatLocalDate(comparisonStart), endDateExclusive: formatLocalDate(comparisonEnd), localDayCount },
      canonical: resolveCanonical(comparisonStart, comparisonEnd),
    },
  };
}
