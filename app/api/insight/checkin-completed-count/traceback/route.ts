import { NextResponse } from 'next/server';
import {
  createSupabaseCheckinSourceAdapter,
  TracebackDeniedError,
  tracebackCheckinContributor,
  verifyMetricEvaluation,
  type SignedMetricEvaluationV1,
} from '@/lib/analytics';
import { authorizeInsightRequest } from '@/lib/insight/server-access';

export const dynamic = 'force-dynamic';

const ALLOWED_REQUEST_KEYS = new Set(['evaluation', 'contributorId']);

function denied(code: string, error: string, status = 403) {
  return NextResponse.json({ status: 'DENIED', code, error }, { status });
}

export async function POST(request: Request) {
  const gate = await authorizeInsightRequest(request, 'SOURCE_CONTRIBUTOR');
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
    return denied('INVALID_REQUEST', 'Only evaluation and contributorId are accepted', 400);
  }
  if (!input.evaluation || typeof input.contributorId !== 'string' || !input.contributorId) {
    return denied('INVALID_REQUEST', 'evaluation and contributorId are required', 400);
  }

  try {
    const result = verifyMetricEvaluation(
      input.evaluation as SignedMetricEvaluationV1,
      gate.access.principal,
      gate.access.evaluationSecret,
    );

    if (result.metricId !== 'CHECKIN_COMPLETED_COUNT' || result.metricVersion !== 1) {
      return denied('UNSUPPORTED_METRIC', 'Only CHECKIN_COMPLETED_COUNT@1 is supported', 403);
    }
    if (result.scope.dimensions.length !== 0 || Object.keys(result.scope.filters).length !== 0) {
      return denied('UNSUPPORTED_SCOPE', 'INSIGHT Check-in V1 is TOTAL only', 403);
    }

    const traceback = await tracebackCheckinContributor({
      result,
      contributorId: input.contributorId,
      source: createSupabaseCheckinSourceAdapter(gate.access.sourceClient),
    });

    return NextResponse.json({ data: traceback });
  } catch (error) {
    if (error instanceof TracebackDeniedError) return denied(error.code, error.message);
    if (error instanceof Error && error.name === 'EvaluationIntegrityError') {
      return denied('INVALID_EVALUATION', error.message);
    }
    console.error('[insight/checkin-completed-count/traceback] failed', error);
    return NextResponse.json(
      { status: 'ERROR', code: 'TRACEBACK_FAILED', error: 'INSIGHT traceback failed' },
      { status: 500 },
    );
  }
}
