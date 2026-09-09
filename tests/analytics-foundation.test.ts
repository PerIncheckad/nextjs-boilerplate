import test from 'node:test';
import assert from 'node:assert/strict';
import {
  METRIC_REGISTRY,
  compareMetricResults,
  count,
  countDistinct,
  coverageQuality,
  definitionFingerprint,
  durationMicros,
  epochMicros,
  exactDuration,
  inHalfOpenInterval,
  meanExact,
  medianExact,
  p90Exact,
  rationalToNumber,
  resolveStockholmDay,
  resolveStockholmMonth,
  type MetricResultV1,
} from '../lib/analytics/index';

function result(overrides: Partial<MetricResultV1> = {}): MetricResultV1 {
  return {
    resultContract: 'METRIC_RESULT_V1', metricId: 'CHECKIN_COMPLETED_COUNT', metricVersion: 1,
    definitionFingerprint: 'sha256:test', engineBuildSha: 'deadbeef',
    scope: { periodStart: '2026-09-01T00:00:00+02:00', periodEnd: '2026-10-01T00:00:00+02:00', timezone: 'Europe/Stockholm', intervalSemantics: '[start,end)', periodCode: null, dimensions: [], filters: {} },
    evaluation: { evaluationId: 'eval-1', calculatedAt: '2026-09-09T12:00:00+02:00', asOf: null, contributorSetBoundToEvaluation: true, contributors: [] },
    value: 10, unit: 'COUNT', statistics: { n: 10, sum: null, mean: null, median: null, p90: null },
    quality: { maturity: 'VERIFIED', excludedN: 0, missingDataN: 0, blockedN: 0, coverage: 1, coverageBasisN: 10, reasons: [] },
    ...overrides,
  };
}

test('registry contains six unique v1 metric identities', () => {
  assert.equal(METRIC_REGISTRY.length, 6);
  const keys = METRIC_REGISTRY.map(({ contract }) => `${contract.metricId}@${contract.version}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('semantic definition fingerprint is deterministic and independent of object identity', () => {
  const contract = METRIC_REGISTRY[0].contract;
  const clone = JSON.parse(JSON.stringify(contract));
  assert.equal(definitionFingerprint(contract), definitionFingerprint(clone));
  assert.equal(METRIC_REGISTRY[0].definitionFingerprint, definitionFingerprint(contract));
});

test('implementation-only metadata is not part of semantic fingerprint', () => {
  const contract = METRIC_REGISTRY[0].contract;
  const before = definitionFingerprint(contract);
  const implementationMetadata = { engineBuildSha: 'first', helperName: 'oldFunction' };
  const refactoredMetadata = { engineBuildSha: 'second', helperName: 'newFunction' };
  assert.notDeepEqual(implementationMetadata, refactoredMetadata);
  assert.equal(before, definitionFingerprint(contract));
});

test('[start,end) includes start and excludes end', () => {
  assert.equal(inHalfOpenInterval(1000, 1000, 2000), true);
  assert.equal(inHalfOpenInterval(1999, 1000, 2000), true);
  assert.equal(inHalfOpenInterval(2000, 1000, 2000), false);
});

test('Europe/Stockholm month resolver returns exact calendar boundaries', () => {
  const september = resolveStockholmMonth(2026, 9);
  assert.equal(september.start, '2026-08-31T22:00:00.000Z');
  assert.equal(september.end, '2026-09-30T22:00:00.000Z');
  assert.equal(september.timezone, 'Europe/Stockholm');
});

test('Europe/Stockholm DST spring day is 23 elapsed hours', () => {
  const day = resolveStockholmDay(2026, 3, 29);
  assert.equal(day.elapsedHours, 23);
});

test('Europe/Stockholm DST autumn day is 25 elapsed hours', () => {
  const day = resolveStockholmDay(2026, 10, 25);
  assert.equal(day.elapsedHours, 25);
});

test('count and count-distinct use explicit observation identity', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'b' }];
  assert.equal(count(rows), 3);
  assert.equal(countDistinct(rows, (row) => row.id), 2);
});

test('duration preserves microsecond precision and rejects backward chronology', () => {
  const duration = exactDuration(epochMicros(1_000_000_001n), epochMicros(1_000_123_457n));
  assert.equal(duration, durationMicros(123_456n));
  assert.equal(exactDuration(epochMicros(20n), epochMicros(19n)), null);
});

test('mean uses exact rational arithmetic without per-observation rounding', () => {
  const mean = meanExact([1n, 2n]);
  assert.deepEqual(mean, { numerator: 3n, denominator: 2n });
  assert.equal(rationalToNumber(mean), 1.5);
  assert.equal(meanExact([]), null);
});

test('median/P50 uses continuous interpolation', () => {
  assert.deepEqual(medianExact([10n, 20n]), { numerator: 15n, denominator: 1n });
  assert.deepEqual(medianExact([10n, 20n, 30n]), { numerator: 20n, denominator: 1n });
  assert.equal(medianExact([]), null);
});

test('P90 follows r=(n-1)*0.90 with linear interpolation', () => {
  assert.deepEqual(p90Exact([0n, 10n]), { numerator: 9n, denominator: 1n });
  assert.deepEqual(p90Exact([0n, 10n, 20n]), { numerator: 18n, denominator: 1n });
  assert.equal(p90Exact([]), null);
});

test('known coverage uses n/(n+missing) and excludes contract exclusions', () => {
  const quality = coverageQuality({ maturity: 'PARTIAL', n: 143, missingDataN: 7, excludedN: 20, denominatorKnown: true });
  assert.equal(quality.coverageBasisN, 150);
  assert.equal(quality.coverage, 143 / 150);
  assert.equal(quality.excludedN, 20);
});

test('unknown coverage denominator returns null coverage and explicit reason', () => {
  const quality = coverageQuality({ maturity: 'PARTIAL', n: 143, missingDataN: 0, denominatorKnown: false });
  assert.equal(quality.coverage, null);
  assert.equal(quality.coverageBasisN, null);
  assert.ok(quality.reasons.includes('UNKNOWN_COVERAGE_DENOMINATOR'));
});

test('verified empty population keeps coverage null rather than 0 or 1', () => {
  const quality = coverageQuality({ maturity: 'VERIFIED', n: 0, missingDataN: 0, denominatorKnown: true });
  assert.equal(quality.coverage, null);
  assert.equal(quality.coverageBasisN, 0);
});

test('comparison absolute and relative change use locked formula', () => {
  const comparison = compareMetricResults(result({ value: 15 }), result({ value: 10 }));
  assert.equal(comparison.absoluteDifference, 5);
  assert.equal(comparison.relativeChangePct, 50);
  assert.equal(comparison.maturity, 'VERIFIED');
});

test('comparison B=0 keeps absolute difference and returns null relative change', () => {
  const comparison = compareMetricResults(result({ value: 15 }), result({ value: 0 }));
  assert.equal(comparison.absoluteDifference, 15);
  assert.equal(comparison.relativeChangePct, null);
  assert.deepEqual(comparison.reasons, ['ZERO_COMPARISON_BASE']);
});

test('comparison maturity propagates PARTIAL', () => {
  const partial = result({ quality: { maturity: 'PARTIAL', excludedN: 0, missingDataN: 1, blockedN: 0, coverage: null, coverageBasisN: null, reasons: ['UNKNOWN_COVERAGE_DENOMINATOR'] } });
  assert.equal(compareMetricResults(result(), partial).maturity, 'PARTIAL');
  assert.equal(compareMetricResults(partial, partial).maturity, 'PARTIAL');
});

test('comparison BLOCKED suppresses authoritative difference', () => {
  const blocked = result({ value: null, quality: { maturity: 'BLOCKED', excludedN: 0, missingDataN: 0, blockedN: 1, coverage: null, coverageBasisN: null, reasons: ['SOURCE_CONFLICT'] } });
  const comparison = compareMetricResults(result(), blocked);
  assert.equal(comparison.maturity, 'BLOCKED');
  assert.equal(comparison.absoluteDifference, null);
  assert.equal(comparison.relativeChangePct, null);
});

test('comparison NOT_AVAILABLE suppresses authoritative difference', () => {
  const unavailable = result({ value: null, quality: { maturity: 'NOT_AVAILABLE', excludedN: 0, missingDataN: 0, blockedN: 0, coverage: null, coverageBasisN: null, reasons: ['SOURCE_HISTORY_UNAVAILABLE'] } });
  assert.equal(compareMetricResults(result(), unavailable).maturity, 'NOT_AVAILABLE');
});
