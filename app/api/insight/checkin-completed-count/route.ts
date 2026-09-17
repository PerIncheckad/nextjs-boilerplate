import { NextResponse } from 'next/server';
import {
  compareMetricResults,
  createSupabaseCheckinSourceAdapter,
  evaluateMetric,
  signMetricEvaluation,
  type MetricResultV1,
} from '@/lib/analytics';
import { authorizeInsightServerRequest } from '@/lib/insight/server-access';
import {
  InsightCheckinPeriodError,
  resolveInsightCheckinPeriods,
} from '@/lib/insight/checkin-period';

export const dynamic = 'force-dynamic';

function denied(code: string, error: string, status: number) {
  return NextResponse.json({ status: 'DENIED', code, error }, { status });
}

function assertPublishableCheckinResult(result: MetricResultV1) {
  if (result.metricId !== 'CHECKIN_COMPLETED_COUNT' || result.metricVersion !== 1) {
    throw new Error('INSIGHT metric identity mismatch');
  }
  if (result.quality.maturity !== 'VERIFIED' || result.value == null) {
    throw new Error('INSIGHT Check-in result is not publishable');
  }
  if (result.scope.dimensions.length !== 0 || Object.keys(result.scope.filters).length !== 0) {
    throw new Error('INSIGHT Check-in V1 is TOTAL only');
  }
  const included = result.evaluation.contributors.filter((item) => item.classification === 'INCLUDED').length;
  if (result.value !== included) {
    throw new Error('INSIGHT Check-in result/contributor integrity mismatch');
  }
}

export async function POST(request: Request) {
  const access = await authorizeInsightServerRequest(request);
  if (!access.ok) return denied(access.code, access.error, access.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return denied('INVALID_REQUEST', 'Request body must be valid JSON', 400);
  }

  const input = body as Record<string, unknown>;
  const allowedKeys = new Set(['startDate', 'endDateExclusive']);
  const unexpected = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    return denied('INVALID_REQUEST', `Unsupported request fields: ${unexpected.join(', ')}`, 400);
  }
  if (typeof input.startDate !== 'string' || typeof input.endDateExclusive !== 'string') {
    return denied('INVALID_REQUEST', 'startDate and endDateExclusive are required', 400);
  }

  try {
    const periods = resolveInsightCheckinPeriods({
      startDate: input.startDate,
      endDateExclusive: input.endDateExclusive,
    });
    const source = createSupabaseCheckinSourceAdapter(access.sourceClient);

    const selected = await evaluateMetric({
      metricId: 'CHECKIN_COMPLETED_COUNT',
      metricVersion: 1,
      period: { start: periods.selected.canonical.start, end: periods.selected.canonical.end },
      engineBuildSha: access.engineBuildSha,
    }, { checkin: source });

    const comparison = await evaluateMetric({
      metricId: 'CHECKIN_COMPLETED_COUNT',
      metricVersion: 1,
      period: { start: periods.comparison.canonical.start, end: periods.comparison.canonical.end },
      engineBuildSha: access.engineBuildSha,
    }, { checkin: source });

    assertPublishableCheckinResult(selected);
    assertPublishableCheckinResult(comparison);

    const delta = compareMetricResults(selected, comparison);
    if (delta.maturity !== 'VERIFIED') {
      throw new Error('INSIGHT Check-in comparison is not publishable');
    }

    return NextResponse.json({
      data: {
        contract: 'INSIGHT_CHECKIN_SLICE_V1',
        selectedPeriod: periods.selected,
        comparisonPeriod: periods.comparison,
        selectedEvaluation: signMetricEvaluation(access.principal, selected, access.evaluationSecret),
        comparisonEvaluation: signMetricEvaluation(access.principal, comparison, access.evaluationSecret),
        comparison: delta,
      },
    });
  } catch (error) {
    if (error instanceof InsightCheckinPeriodError) {
      return denied(error.code, error.message, 400);
    }
    console.error('[insight/checkin-completed-count] evaluation failed', error);
    return NextResponse.json(
      { status: 'ERROR', code: 'INSIGHT_EVALUATION_FAILED', error: 'INSIGHT evaluation failed' },
      { status: 500 },
    );
  }
}
