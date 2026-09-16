import { NextResponse } from 'next/server';
import {
  compareMetricResults,
  createSupabaseCheckinSourceAdapter,
  evaluateMetric,
  signMetricEvaluation,
  type MetricResultV1,
} from '@/lib/analytics';
import { resolveInsightCheckinPeriods, InsightPeriodError } from '@/lib/insight/checkin-period';
import { authorizeInsightRequest } from '@/lib/insight/server-access';

export const dynamic = 'force-dynamic';

const ALLOWED_REQUEST_KEYS = new Set(['startDate', 'endDateExclusive']);

function denied(code: string, error: string, status = 403) {
  return NextResponse.json({ status: 'DENIED', code, error }, { status });
}

function assertPublishableCheckinResult(result: MetricResultV1) {
  if (result.metricId !== 'CHECKIN_COMPLETED_COUNT' || result.metricVersion !== 1) {
    throw new Error('INSIGHT received an unexpected metric identity');
  }
  if (result.quality.maturity !== 'VERIFIED' || result.value == null) {
    throw new Error('INSIGHT Check-in result is not publishable');
  }
  if (result.scope.dimensions.length !== 0 || Object.keys(result.scope.filters).length !== 0) {
    throw new Error('INSIGHT Check-in V1 must remain TOTAL only');
  }
  const included = result.evaluation.contributors.filter((item) => item.classification === 'INCLUDED').length;
  if (result.value !== included || result.statistics.n !== included) {
    throw new Error('INSIGHT Check-in result/contributor integrity mismatch');
  }
}

export async function POST(request: Request) {
  const gate = await authorizeInsightRequest(request, 'AGGREGATE');
  if (!gate.ok) return denied(gate.code, gate.error, gate.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return denied('INVALID_REQUEST', 'Request body must be valid JSON', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return denied('INVALID_REQUEST', 'Request body must be an object', 400);
  }
  const input = body as Record<string, unknown>;
  const unknownKeys = Object.keys(input).filter((key) => !ALLOWED_REQUEST_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return denied('INVALID_REQUEST', 'Only startDate and endDateExclusive are accepted', 400);
  }
  if (typeof input.startDate !== 'string' || typeof input.endDateExclusive !== 'string') {
    return denied('INVALID_REQUEST', 'startDate and endDateExclusive are required', 400);
  }

  try {
    const periods = resolveInsightCheckinPeriods(input.startDate, input.endDateExclusive);
    const source = createSupabaseCheckinSourceAdapter(gate.access.sourceClient);

    const [selected, comparison] = await Promise.all([
      evaluateMetric({
        metricId: 'CHECKIN_COMPLETED_COUNT',
        metricVersion: 1,
        period: {
          start: periods.selectedCanonical.start,
          end: periods.selectedCanonical.end,
        },
        engineBuildSha: gate.access.engineBuildSha,
      }, { checkin: source }),
      evaluateMetric({
        metricId: 'CHECKIN_COMPLETED_COUNT',
        metricVersion: 1,
        period: {
          start: periods.comparisonCanonical.start,
          end: periods.comparisonCanonical.end,
        },
        engineBuildSha: gate.access.engineBuildSha,
      }, { checkin: source }),
    ]);

    assertPublishableCheckinResult(selected);
    assertPublishableCheckinResult(comparison);

    const delta = compareMetricResults(selected, comparison);
    if (delta.maturity !== 'VERIFIED') {
      throw new Error('INSIGHT comparison is not publishable');
    }

    return NextResponse.json({
      data: {
        contract: 'INSIGHT_CHECKIN_SLICE_V1',
        selectedLocalPeriod: periods.selectedLocal,
        selectedCanonicalPeriod: periods.selectedCanonical,
        comparisonLocalPeriod: periods.comparisonLocal,
        comparisonCanonicalPeriod: periods.comparisonCanonical,
        selectedEvaluation: signMetricEvaluation(
          gate.access.principal,
          selected,
          gate.access.evaluationSecret,
        ),
        comparisonEvaluation: signMetricEvaluation(
          gate.access.principal,
          comparison,
          gate.access.evaluationSecret,
        ),
        comparison: delta,
      },
    });
  } catch (error) {
    if (error instanceof InsightPeriodError) {
      return denied('INVALID_PERIOD', error.message, 400);
    }
    console.error('[insight/checkin-completed-count] evaluation failed', error);
    return NextResponse.json(
      { status: 'ERROR', code: 'EVALUATION_FAILED', error: 'INSIGHT Check-in evaluation failed' },
      { status: 500 },
    );
  }
}
