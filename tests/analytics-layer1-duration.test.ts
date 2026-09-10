import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  exactDuration,
  meanExact,
  medianExact,
  p90Exact,
  sumExact,
} from '../lib/analytics/statistics';
import { parseTimestampMicros } from '../lib/analytics/timestamp-micros';
import {
  Layer1PeriodReadError,
  readClosedLayer1PeriodsExhaustively,
  type ClosedLayer1PeriodObservation,
  type Layer1PeriodPageSource,
  type Layer1PeriodSourceAdapter,
} from '../lib/analytics/source-adapters/layer1-period';
import {
  evaluateLayer1PeriodDurationHours,
  LAYER1_PERIOD_DURATION_HOURS_METRIC_ID,
  LAYER1_PERIOD_DURATION_HOURS_VERSION,
} from '../lib/analytics/evaluators/layer1-period-duration';
import { evaluateMetric } from '../lib/analytics/platform-service';

const cohort = {
  start: '2026-08-01T00:00:00+02:00',
  end: '2026-10-01T00:00:00+02:00',
};

const rawA = {
  period_id: '8c208262-168c-4ab3-a4a3-125239a6ec1e',
  period_type: 'DOWNTIME',
  started_at: '2026-08-21T17:59:06.121000+00:00',
  ended_at: '2026-08-21T18:41:09.300364+00:00',
  reason_code: 'OTHER',
  source_system: 'CHECKIN',
  source_entity: 'checkins',
  source_record_id: '8e0f71ab-8e73-46a9-a769-109bf0947ea7',
  source_event_id: '7d59b47e-32a3-4e4c-87d5-1e6b6022c529',
};

const rawB = {
  period_id: 'e2767d57-0217-4c79-92b6-5999182290a3',
  period_type: 'AVAILABLE',
  started_at: '2026-09-03T10:03:31.296258+00:00',
  ended_at: '2026-09-03T13:09:00.000000+00:00',
  reason_code: null,
  source_system: 'INCHECKAD',
  source_entity: 'vehicle_journey_state_reconciliations',
  source_record_id: '82e792eb-7e2c-482b-9581-6f9c6413ae31',
  source_event_id: '13a47a38-8439-48ac-a8b9-1fe60c305671',
};

function pageSource(rows: readonly unknown[], counts: readonly number[] = [rows.length, rows.length]): Layer1PeriodPageSource {
  let countIndex = 0;
  return {
    async readExactCount() {
      return counts[Math.min(countIndex++, counts.length - 1)];
    },
    async readPage(_period, from, to) {
      return rows.slice(from, to + 1);
    },
  };
}

async function normalized(rows: readonly unknown[]): Promise<readonly ClosedLayer1PeriodObservation[]> {
  return readClosedLayer1PeriodsExhaustively(pageSource(rows), cohort, { pageSize: 1 });
}

function sourceWith(observations: readonly ClosedLayer1PeriodObservation[]): Layer1PeriodSourceAdapter {
  return { async readCompleted() { return observations; } };
}

test('Production canonical timestamps preserve exact microsecond durations and aggregates', () => {
  const a = exactDuration(parseTimestampMicros(rawA.started_at), parseTimestampMicros(rawA.ended_at));
  const b = exactDuration(parseTimestampMicros(rawB.started_at), parseTimestampMicros(rawB.ended_at));
  assert.equal(a, 2_523_179_364n);
  assert.equal(b, 11_128_703_742n);
  assert.equal(sumExact([a!, b!]), 13_651_883_106n);
  assert.deepEqual(meanExact([a!, b!]), { numerator: 6_825_941_553n, denominator: 1n });
  assert.deepEqual(medianExact([a!, b!]), { numerator: 6_825_941_553n, denominator: 1n });
  assert.deepEqual(p90Exact([a!, b!]), { numerator: 51_340_756_521n, denominator: 5n });
});

test('Layer 1 evaluator returns canonical HOURS statistics and metric-specific value = mean', async () => {
  const observations = await normalized([rawA, rawB]);
  const result = await evaluateLayer1PeriodDurationHours({
    source: sourceWith(observations),
    period: cohort,
    engineBuildSha: 'rpt05-test-sha',
    calculatedAt: '2026-09-10T05:00:00.000Z',
    evaluationId: 'layer1-eval-1',
  });

  assert.equal(result.resultContract, 'METRIC_RESULT_V1');
  assert.equal(result.metricId, 'LAYER1_PERIOD_DURATION_HOURS');
  assert.equal(result.metricVersion, 1);
  assert.equal(result.unit, 'HOURS');
  assert.equal(result.statistics.n, 2);
  assert.ok(Math.abs(result.statistics.sum! - 3.7921897516666667) < 1e-15);
  assert.ok(Math.abs(result.statistics.mean! - 1.8960948758333334) < 1e-15);
  assert.ok(Math.abs(result.statistics.median! - 1.8960948758333334) < 1e-15);
  assert.ok(Math.abs(result.statistics.p90! - 2.8522642511666667) < 1e-15);
  assert.equal(result.value, result.statistics.mean);
  assert.notEqual(result.value, result.statistics.sum);
  assert.notEqual(result.value, result.statistics.p90);
  assert.equal(result.quality.maturity, 'PARTIAL');
  assert.equal(result.quality.coverage, null);
  assert.equal(result.quality.coverageBasisN, null);
  assert.ok(result.quality.reasons.includes('UNKNOWN_COVERAGE_DENOMINATOR'));
  assert.deepEqual(result.evaluation.contributors.map((item) => item.observationIdentity), [rawA.period_id, rawB.period_id]);
  assert.deepEqual(result.evaluation.contributors.map((item) => item.sourceBusinessTimestamp), [rawA.ended_at, rawB.ended_at]);
});

test('empty completion cohort returns n=0 and null duration scalars including value', async () => {
  const result = await evaluateLayer1PeriodDurationHours({
    source: sourceWith([]), period: cohort, engineBuildSha: 'rpt05-test-sha', calculatedAt: '2026-09-10T05:00:00.000Z',
  });
  assert.deepEqual(result.statistics, { n: 0, sum: null, mean: null, median: null, p90: null });
  assert.equal(result.value, null);
});

test('exhaustive source read fails closed on backward chronology', async () => {
  const backward = { ...rawA, period_id: 'backward', started_at: '2026-09-01T12:00:00.000002+00:00', ended_at: '2026-09-01T12:00:00.000001+00:00' };
  await assert.rejects(() => normalized([backward]), (error: unknown) => error instanceof Layer1PeriodReadError && error.code === 'BACKWARD_CHRONOLOGY');
});

test('exhaustive source read fails closed on duplicate period_id', async () => {
  await assert.rejects(
    () => readClosedLayer1PeriodsExhaustively(pageSource([rawA, { ...rawB, period_id: rawA.period_id }]), cohort, { pageSize: 1 }),
    (error: unknown) => error instanceof Layer1PeriodReadError && error.code === 'DUPLICATE_OBSERVATION_ID',
  );
});

test('exhaustive source read fails closed on truncation and population drift', async () => {
  const truncated: Layer1PeriodPageSource = {
    async readExactCount() { return 2; },
    async readPage() { return [rawA]; },
  };
  await assert.rejects(
    () => readClosedLayer1PeriodsExhaustively(truncated, cohort, { pageSize: 2 }),
    (error: unknown) => error instanceof Layer1PeriodReadError && error.code === 'SOURCE_TRUNCATED_OR_CHANGED',
  );
  await assert.rejects(
    () => readClosedLayer1PeriodsExhaustively(pageSource([rawA, rawB], [2, 3]), cohort, { pageSize: 2 }),
    (error: unknown) => error instanceof Layer1PeriodReadError && error.code === 'SOURCE_TRUNCATED_OR_CHANGED',
  );
});

test('microsecond period bounds are valid without JavaScript Date millisecond truncation', async () => {
  const microPeriod = { start: '2026-09-01T00:00:00.000001+00:00', end: '2026-09-01T00:00:00.000002+00:00' };
  const rows = await readClosedLayer1PeriodsExhaustively(pageSource([]), microPeriod);
  assert.deepEqual(rows, []);
});

test('source contract is closed-primary completion cohort only and never activity/now/payload duration truth', () => {
  const adapterSource = fs.readFileSync(path.join(process.cwd(), 'lib/analytics/source-adapters/layer1-period.ts'), 'utf8');
  const evaluatorSource = fs.readFileSync(path.join(process.cwd(), 'lib/analytics/evaluators/layer1-period-duration.ts'), 'utf8');
  assert.match(adapterSource, /\.from\('vehicle_journey_periods'\)/);
  assert.match(adapterSource, /\.not\('ended_at', 'is', null\)/);
  assert.match(adapterSource, /\.gte\('ended_at', period\.start\)/);
  assert.match(adapterSource, /\.lt\('ended_at', period\.end\)/);
  assert.match(adapterSource, /\.order\('ended_at', \{ ascending: true \}\)/);
  assert.match(adapterSource, /\.order\('period_id', \{ ascending: true \}\)/);
  assert.doesNotMatch(adapterSource, /vehicle_journey_activity_periods/);
  assert.doesNotMatch(evaluatorSource, /durationHours|Math\.round|vehicle-journey-metrics/);
  assert.match(evaluatorSource, /value: mean/);
});

test('platform service executes exactly approved Layer 1 duration metric while preserving Check-in path', async () => {
  const observations = await normalized([rawA, rawB]);
  const result = await evaluateMetric({
    metricId: LAYER1_PERIOD_DURATION_HOURS_METRIC_ID,
    metricVersion: LAYER1_PERIOD_DURATION_HOURS_VERSION,
    period: cohort,
    engineBuildSha: 'rpt05-test-sha',
    calculatedAt: '2026-09-10T05:00:00.000Z',
  }, {
    checkin: { async readCompleted() { return []; } },
    layer1Period: sourceWith(observations),
  });
  assert.equal(result.metricId, 'LAYER1_PERIOD_DURATION_HOURS');
  assert.equal(result.value, result.statistics.mean);
});
