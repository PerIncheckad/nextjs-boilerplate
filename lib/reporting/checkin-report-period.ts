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

function localDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function latestCompletedDayInput(now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() - 1);
  return localDateInput(date);
}

export function latestCompletedMonthInput(now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
