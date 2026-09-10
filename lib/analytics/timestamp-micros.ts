import { epochMicros } from './statistics';
import type { EpochMicros } from './contracts';

const ISO_WITH_OFFSET = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function daysFromCivil(year: number, month: number, day: number): bigint {
  let y = BigInt(year);
  const m = BigInt(month);
  y -= m <= 2n ? 1n : 0n;
  const era = y >= 0n ? y / 400n : (y - 399n) / 400n;
  const yearOfEra = y - era * 400n;
  const monthPrime = m + (m > 2n ? -3n : 9n);
  const dayOfYear = (153n * monthPrime + 2n) / 5n + BigInt(day) - 1n;
  const dayOfEra = yearOfEra * 365n + yearOfEra / 4n - yearOfEra / 100n + dayOfYear;
  return era * 146097n + dayOfEra - 719468n;
}

function offsetMinutes(value: string): number {
  if (value === 'Z') return 0;
  const sign = value[0] === '-' ? -1 : 1;
  const compact = value.slice(1).replace(':', '');
  const hours = Number(compact.slice(0, 2));
  const minutes = compact.length === 4 ? Number(compact.slice(2, 4)) : 0;
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    throw new Error(`Invalid timestamp offset: ${value}`);
  }
  return sign * (hours * 60 + minutes);
}

/** Parse an ISO/Postgres timestamp with explicit timezone without losing fractional microseconds. */
export function parseTimestampMicros(value: string): EpochMicros {
  const match = ISO_WITH_OFFSET.exec(value);
  if (!match) throw new Error(`Timestamp must include an explicit timezone and at most 6 fractional digits: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fractionalMicros = BigInt((match[7] ?? '').padEnd(6, '0') || '0');

  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid timestamp date: ${value}`);
  }
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`Invalid timestamp time: ${value}`);

  const localSeconds = daysFromCivil(year, month, day) * 86400n
    + BigInt(hour * 3600 + minute * 60 + second);
  const utcSeconds = localSeconds - BigInt(offsetMinutes(match[8]) * 60);
  return epochMicros(utcSeconds * 1_000_000n + fractionalMicros);
}
