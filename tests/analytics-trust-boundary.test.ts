import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMetric,
  EvaluationIntegrityError,
  signMetricEvaluation,
  TracebackDeniedError,
  tracebackCheckinContributor,
  verifyMetricEvaluation,
  type CheckinSourceAdapter,
  type CheckinTracebackSourceAdapter,
  type MetricResultV1,
} from '../lib/analytics/index';
import { classifyAnalyticsVerification } from '../lib/analytics/server-consumer';

const period = {
  start: '2026-09-08T00:00:00+02:00',
  end: '2026-09-09T00:00:00+02:00',
};
const principal = { id: 'user-1', email: 'internal@example.com' };
const secret = 'rpt-03-test-secret';

function metricSource(): CheckinSourceAdapter {
  return {
    async readCompleted() {
      return [
        { id: 'checkin-1', status: 'COMPLETED', completedAt: '2026-09-08T08:00:00.123Z' },
        { id: 'checkin-2', status: 'COMPLETED', completedAt: '2026-09-08T09:00:00.456Z' },
      ];
    },
  };
}

async function metricResult(): Promise<MetricResultV1> {
  return evaluateMetric({
    metricId: 'CHECKIN_COMPLETED_COUNT',
    metricVersion: 1,
    period,
    engineBuildSha: 'engine-sha-rpt03',
    calculatedAt: '2026-09-09T10:00:00.000Z',
    evaluationId: 'eval-rpt03-1',
  }, { checkin: metricSource() });
}

function tracebackSource(overrides: Partial<{ id: string; completedAt: string }> = {}): CheckinTracebackSourceAdapter {
  const base = metricSource();
  return {
    ...base,
    async readCanonicalById(id) {
      if (id !== 'checkin-1') return null;
      return {
        id: overrides.id ?? 'checkin-1',
        status: 'COMPLETED',
        completedAt: overrides.completedAt ?? '2026-09-08T08:00:00.123Z',
      };
    },
  };
}

test('existing INCHECKAD internal authorization allows verified app user', () => {
  const decision = classifyAnalyticsVerification({
    ok: true,
    user: { id: principal.id, email: principal.email },
  });
  assert.equal(decision.allowed, true);
  if (decision.allowed) assert.deepEqual(decision.principal, principal);
});

test('missing or denied INCHECKAD authorization returns explicit DENIED decision', () => {
  const unauthenticated = classifyAnalyticsVerification({ ok: false, status: 401, error: 'Authentication required' });
  assert.deepEqual(unauthenticated, {
    allowed: false,
    status: 401,
    code: 'AUTHENTICATION_REQUIRED',
    error: 'Authentication required',
  });

  const denied = classifyAnalyticsVerification({ ok: false, status: 403, error: 'Access denied' });
  assert.deepEqual(denied, {
    allowed: false,
    status: 403,
    code: 'ACCESS_DENIED',
    error: 'Access denied',
  });
});

test('signed evaluation binds exact evaluationId and contributor set', async () => {
  const result = await metricResult();
  const envelope = signMetricEvaluation(principal, result, secret);
  const verified = verifyMetricEvaluation(envelope, principal, secret);
  assert.equal(verified.evaluation.evaluationId, 'eval-rpt03-1');
  assert.deepEqual(
    verified.evaluation.contributors.map((contributor) => contributor.sourceRecordId),
    ['checkin-1', 'checkin-2'],
  );
});

test('evaluationId manipulation is detected and denied', async () => {
  const envelope = signMetricEvaluation(principal, await metricResult(), secret);
  const tampered = structuredClone(envelope);
  tampered.result.evaluation.evaluationId = 'forged-evaluation';
  assert.throws(
    () => verifyMetricEvaluation(tampered, principal, secret),
    (error: unknown) => error instanceof EvaluationIntegrityError,
  );
});

test('contributor-set manipulation is detected and denied', async () => {
  const envelope = signMetricEvaluation(principal, await metricResult(), secret);
  const tampered = structuredClone(envelope);
  tampered.result.evaluation.contributors = tampered.result.evaluation.contributors.slice(0, 1);
  assert.throws(
    () => verifyMetricEvaluation(tampered, principal, secret),
    (error: unknown) => error instanceof EvaluationIntegrityError,
  );
});

test('signed evaluation is bound to authenticated principal', async () => {
  const envelope = signMetricEvaluation(principal, await metricResult(), secret);
  assert.throws(
    () => verifyMetricEvaluation(envelope, { id: 'user-2', email: principal.email }, secret),
    (error: unknown) => error instanceof EvaluationIntegrityError,
  );
});

test('traceback resolves exact contributor to exact canonical checkins.id', async () => {
  const result = await metricResult();
  const traceback = await tracebackCheckinContributor({
    result,
    contributorId: 'checkin-1',
    source: tracebackSource(),
  });
  assert.equal(traceback.evaluationId, 'eval-rpt03-1');
  assert.equal(traceback.contributor.observationIdentity, 'checkin-1');
  assert.equal(traceback.contributor.sourceRecordId, 'checkin-1');
  assert.deepEqual(traceback.source, {
    id: 'checkin-1',
    status: 'COMPLETED',
    completed_at: '2026-09-08T08:00:00.123Z',
  });
});

test('traceback denies contributor without exact canonical source identity', async () => {
  const result = structuredClone(await metricResult());
  result.evaluation.contributors = [
    { ...result.evaluation.contributors[0], sourceRecordId: '' },
    ...result.evaluation.contributors.slice(1),
  ];
  await assert.rejects(
    () => tracebackCheckinContributor({ result, contributorId: 'checkin-1', source: tracebackSource() }),
    (error: unknown) => error instanceof TracebackDeniedError && error.code === 'INVALID_SOURCE_IDENTITY',
  );
});

test('traceback denies canonical source row whose completion provenance changed', async () => {
  const result = await metricResult();
  await assert.rejects(
    () => tracebackCheckinContributor({
      result,
      contributorId: 'checkin-1',
      source: tracebackSource({ completedAt: '2026-09-08T08:00:01.123Z' }),
    }),
    (error: unknown) => error instanceof TracebackDeniedError && error.code === 'SOURCE_PROVENANCE_MISMATCH',
  );
});

test('unknown metric/version is denied by metric execution and traceback boundaries', async () => {
  await assert.rejects(
    () => evaluateMetric({
      metricId: 'UNKNOWN_METRIC', metricVersion: 99, period, engineBuildSha: 'engine-sha-rpt03',
    } as never, { checkin: metricSource() }),
    /Unsupported metric execution/,
  );

  const result = structuredClone(await metricResult());
  result.metricVersion = 99;
  await assert.rejects(
    () => tracebackCheckinContributor({ result, contributorId: 'checkin-1', source: tracebackSource() }),
    (error: unknown) => error instanceof TracebackDeniedError && error.code === 'UNSUPPORTED_METRIC',
  );
});
