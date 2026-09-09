import { NextResponse } from 'next/server';
import {
  authorizeAnalyticsServerRequest,
  createSupabaseCheckinSourceAdapter,
  evaluateMetric,
  signMetricEvaluation,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';

function denied(code: string, error: string, status = 403) {
  return NextResponse.json({ status: 'DENIED', code, error }, { status });
}

export async function POST(request: Request) {
  const access = await authorizeAnalyticsServerRequest(request);
  if (!access.ok) return denied(access.code, access.error, access.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return denied('INVALID_REQUEST', 'Request body must be valid JSON', 400);
  }

  const input = body as Record<string, unknown>;
  if (input.metricId !== 'CHECKIN_COMPLETED_COUNT' || input.metricVersion !== 1) {
    return denied('UNSUPPORTED_METRIC', 'Only CHECKIN_COMPLETED_COUNT v1 is available in RPT-03');
  }

  const period = input.period as Record<string, unknown> | undefined;
  if (!period || typeof period.start !== 'string' || typeof period.end !== 'string') {
    return denied('INVALID_PERIOD', 'period.start and period.end are required', 400);
  }

  try {
    const result = await evaluateMetric({
      metricId: 'CHECKIN_COMPLETED_COUNT',
      metricVersion: 1,
      period: { start: period.start, end: period.end },
      engineBuildSha: access.engineBuildSha,
    }, {
      checkin: createSupabaseCheckinSourceAdapter(access.sourceClient),
    });

    const evaluation = signMetricEvaluation(access.principal, result, access.evaluationSecret);
    return NextResponse.json({ data: evaluation });
  } catch (error) {
    console.error('[analytics/checkin-completed-count] evaluation failed', error);
    return NextResponse.json({ status: 'ERROR', code: 'EVALUATION_FAILED', error: 'Metric evaluation failed' }, { status: 500 });
  }
}
