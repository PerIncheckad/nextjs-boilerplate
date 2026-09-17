import { NextResponse } from 'next/server';
import {
  createSupabaseCheckinSourceAdapter,
  TracebackDeniedError,
  tracebackCheckinContributor,
  verifyMetricEvaluation,
  type SignedMetricEvaluationV1,
} from '@/lib/analytics';
import { authorizeInsightServerRequest } from '@/lib/insight/server-access';

export const dynamic = 'force-dynamic';

function denied(code: string, error: string, status = 403) {
  return NextResponse.json({ status: 'DENIED', code, error }, { status });
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
  const allowedKeys = new Set(['evaluation', 'contributorId']);
  const unexpected = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) return denied('INVALID_REQUEST', `Unsupported request fields: ${unexpected.join(', ')}`, 400);
  if (!input.evaluation || typeof input.contributorId !== 'string' || !input.contributorId) {
    return denied('INVALID_REQUEST', 'evaluation and contributorId are required', 400);
  }

  try {
    const result = verifyMetricEvaluation(
      input.evaluation as SignedMetricEvaluationV1,
      access.principal,
      access.evaluationSecret,
    );
    if (result.metricId !== 'CHECKIN_COMPLETED_COUNT' || result.metricVersion !== 1) {
      return denied('UNSUPPORTED_METRIC', 'Only CHECKIN_COMPLETED_COUNT v1 is available in INSIGHT V1');
    }

    const traceback = await tracebackCheckinContributor({
      result,
      contributorId: input.contributorId,
      source: createSupabaseCheckinSourceAdapter(access.sourceClient),
    });
    return NextResponse.json({ data: traceback });
  } catch (error) {
    if (error instanceof TracebackDeniedError) return denied(error.code, error.message);
    if (error instanceof Error && error.name === 'EvaluationIntegrityError') {
      return denied('INVALID_EVALUATION', error.message);
    }
    console.error('[insight/checkin-completed-count/traceback] traceback failed', error);
    return NextResponse.json({ status: 'ERROR', code: 'TRACEBACK_FAILED', error: 'Traceback failed' }, { status: 500 });
  }
}
