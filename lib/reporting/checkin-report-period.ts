import { resolveStockholmDay, resolveStockholmMonth } from '@/lib/analytics/time';

export type CheckinReportPeriodType = 'day' | 'month';

export type CheckinReportPeriod = {
  start: string;
  end: string;
  timezone: 'Europe/Stockholm';
  intervalSemantics: '[start,end)';
};

export function resolveCheckinReportPeriod(type: CheckinReportPeriodType, value: string): CheckinReportPeriod {
  if (type === 'day') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error('Ogiltigt dagformat');
    return resolveStockholmDay(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Ogiltigt månadsformat');
  return resolveStockholmMonth(Number(match[1]), Number(match[2]));
}

export function isCompletedCheckinReportPeriod(period: CheckinReportPeriod, nowMs = Date.now()): boolean {
  return Date.parse(period.end) <= nowMs;
}

function dayInput(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthInput(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function latestCompletedDayInput(now = new Date()): string {
  const nowMs = now.getTime();

  // Enumerate nearby calendar-date candidates only. The canonical Stockholm
  // resolver decides which candidate period has actually closed, including DST.
  for (let offsetDays = 0; offsetDays < 4; offsetDays += 1) {
    const candidate = new Date(nowMs - offsetDays * 86_400_000);
    const year = candidate.getUTCFullYear();
    const month = candidate.getUTCMonth() + 1;
    const day = candidate.getUTCDate();
    const period = resolveStockholmDay(year, month, day);
    if (isCompletedCheckinReportPeriod(period, nowMs)) return dayInput(year, month, day);
  }

  throw new Error('Kunde inte bestämma senaste avslutade Stockholm-dag');
}

export function latestCompletedMonthInput(now = new Date()): string {
  const nowMs = now.getTime();
  const candidate = new Date(now);
  candidate.setUTCDate(1);
  candidate.setUTCHours(12, 0, 0, 0);

  // As above, candidate enumeration is timezone-neutral. Completion is decided
  // exclusively by resolveStockholmMonth(...).
  for (let offsetMonths = 0; offsetMonths < 3; offsetMonths += 1) {
    const year = candidate.getUTCFullYear();
    const month = candidate.getUTCMonth() + 1;
    const period = resolveStockholmMonth(year, month);
    if (isCompletedCheckinReportPeriod(period, nowMs)) return monthInput(year, month);
    candidate.setUTCMonth(candidate.getUTCMonth() - 1);
  }

  throw new Error('Kunde inte bestämma senaste avslutade Stockholm-månad');
}
