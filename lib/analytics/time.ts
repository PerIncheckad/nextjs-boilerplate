export const ANALYTICS_TIMEZONE = 'Europe/Stockholm' as const;
export const INTERVAL_SEMANTICS = '[start,end)' as const;

type LocalDate = { year: number; month: number; day: number; hour?: number; minute?: number; second?: number };

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ANALYTICS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function zoneParts(epochMs: number) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

export function stockholmLocalToEpochMs(local: LocalDate): number {
  const target = Date.UTC(local.year, local.month - 1, local.day, local.hour ?? 0, local.minute ?? 0, local.second ?? 0);
  let guess = target;
  for (let i = 0; i < 4; i += 1) {
    const actual = zoneParts(guess);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const delta = target - represented;
    if (delta === 0) return guess;
    guess += delta;
  }
  const actual = zoneParts(guess);
  if (actual.year !== local.year || actual.month !== local.month || actual.day !== local.day || actual.hour !== (local.hour ?? 0) || actual.minute !== (local.minute ?? 0) || actual.second !== (local.second ?? 0)) throw new Error('Local Stockholm time is ambiguous or invalid');
  return guess;
}

function nextDate(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function resolveStockholmDay(year: number, month: number, day: number) {
  const next = nextDate(year, month, day);
  const startMs = stockholmLocalToEpochMs({ year, month, day });
  const endMs = stockholmLocalToEpochMs(next);
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), timezone: ANALYTICS_TIMEZONE, intervalSemantics: INTERVAL_SEMANTICS, elapsedHours: (endMs - startMs) / 3_600_000 };
}

export function resolveStockholmMonth(year: number, month: number) {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const startMs = stockholmLocalToEpochMs({ year, month, day: 1 });
  const endMs = stockholmLocalToEpochMs({ year: nextYear, month: nextMonth, day: 1 });
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), timezone: ANALYTICS_TIMEZONE, intervalSemantics: INTERVAL_SEMANTICS };
}

export function inHalfOpenInterval(epochMs: number, startMs: number, endMs: number): boolean {
  return epochMs >= startMs && epochMs < endMs;
}
