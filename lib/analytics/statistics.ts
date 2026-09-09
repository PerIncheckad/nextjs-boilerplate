import type { DurationMicros, EpochMicros, ExactRational, MetricMaturity, MetricQuality } from './contracts';

function assertDenominator(value: bigint) {
  if (value <= 0n) throw new Error('Exact rational denominator must be positive');
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x || 1n;
}

export function rational(numerator: bigint, denominator = 1n): ExactRational {
  assertDenominator(denominator);
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function epochMicros(value: bigint): EpochMicros { return value as EpochMicros; }
export function durationMicros(value: bigint): DurationMicros { return value as DurationMicros; }

export function exactDuration(start: EpochMicros, end: EpochMicros): DurationMicros | null {
  if (end < start) return null;
  return durationMicros(end - start);
}

export function count<T>(values: readonly T[]): number { return values.length; }
export function countDistinct<T>(values: readonly T[], identity: (value: T) => string): number {
  return new Set(values.map(identity)).size;
}

export function sumExact(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

export function meanExact(values: readonly bigint[]): ExactRational | null {
  if (!values.length) return null;
  return rational(sumExact(values), BigInt(values.length));
}

export function percentileExact(values: readonly bigint[], percentile: number): ExactRational | null {
  if (!values.length) return null;
  if (!(percentile >= 0 && percentile <= 1)) throw new Error('Percentile must be in [0,1]');
  const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (sorted.length === 1) return rational(sorted[0]);
  const scale = 1_000_000n;
  const pScaled = BigInt(Math.round(percentile * Number(scale)));
  const rankNumerator = BigInt(sorted.length - 1) * pScaled;
  const lower = Number(rankNumerator / scale);
  const remainder = rankNumerator % scale;
  if (remainder === 0n) return rational(sorted[lower]);
  const upper = lower + 1;
  const numerator = sorted[lower] * (scale - remainder) + sorted[upper] * remainder;
  return rational(numerator, scale);
}

export function medianExact(values: readonly bigint[]): ExactRational | null { return percentileExact(values, 0.5); }
export function p90Exact(values: readonly bigint[]): ExactRational | null { return percentileExact(values, 0.9); }

export function rationalToNumber(value: ExactRational | null): number | null {
  return value == null ? null : Number(value.numerator) / Number(value.denominator);
}

export function coverageQuality(input: {
  maturity: MetricMaturity;
  n: number;
  missingDataN: number;
  excludedN?: number;
  blockedN?: number;
  denominatorKnown: boolean;
  reasons?: readonly string[];
}): MetricQuality {
  const excludedN = input.excludedN ?? 0;
  const blockedN = input.blockedN ?? 0;
  const basis = input.denominatorKnown ? input.n + input.missingDataN : null;
  const coverage = basis == null || basis === 0 ? null : input.n / basis;
  const reasons = [...(input.reasons ?? [])];
  if (!input.denominatorKnown && input.maturity === 'PARTIAL' && !reasons.includes('UNKNOWN_COVERAGE_DENOMINATOR')) {
    reasons.push('UNKNOWN_COVERAGE_DENOMINATOR');
  }
  return { maturity: input.maturity, excludedN, missingDataN: input.missingDataN, blockedN, coverage, coverageBasisN: basis, reasons };
}
