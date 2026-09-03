const OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Stockholm',
  timeZoneName: 'longOffset',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;
const EXPLICIT_ZONE_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

function stockholmOffsetMinutes(utcGuessMs: number): number {
  const zoneName = OFFSET_FORMATTER.formatToParts(new Date(utcGuessMs)).find((part) => part.type === 'timeZoneName')?.value;
  const match = zoneName?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Kunde inte fastställa Europe/Stockholm-offset');
  const sign = match[1] === '+' ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

export function parseOperationalDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate) return null;

  if (EXPLICIT_ZONE_RE.test(candidate)) {
    const parsed = new Date(candidate);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const match = candidate.match(LOCAL_RE);
  if (!match) return null;

  const [, year, month, day, hour, minute, second = '00'] = match;
  const utcGuessMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let offsetMinutes = stockholmOffsetMinutes(utcGuessMs);
  let resolvedMs = utcGuessMs - offsetMinutes * 60_000;

  // Re-evaluate once at the resolved instant so DST transitions use the actual Stockholm offset.
  const resolvedOffset = stockholmOffsetMinutes(resolvedMs);
  if (resolvedOffset !== offsetMinutes) {
    offsetMinutes = resolvedOffset;
    resolvedMs = utcGuessMs - offsetMinutes * 60_000;
  }

  return new Date(resolvedMs).toISOString();
}
