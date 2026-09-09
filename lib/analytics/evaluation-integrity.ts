import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MetricResultV1 } from './contracts';

export type AnalyticsPrincipal = {
  id: string;
  email: string;
};

export type SignedMetricEvaluationV1 = {
  contract: 'SIGNED_METRIC_EVALUATION_V1';
  principalId: string;
  principalEmail: string;
  result: MetricResultV1;
  integrity: string;
};

export class EvaluationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationIntegrityError';
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

function signingPayload(principal: AnalyticsPrincipal, result: MetricResultV1): string {
  return JSON.stringify(canonicalize({
    contract: 'SIGNED_METRIC_EVALUATION_V1',
    principalId: principal.id,
    principalEmail: principal.email.toLowerCase(),
    result,
  }));
}

function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function signMetricEvaluation(
  principal: AnalyticsPrincipal,
  result: MetricResultV1,
  secret: string,
): SignedMetricEvaluationV1 {
  if (!secret) throw new EvaluationIntegrityError('Analytics evaluation signing unavailable');
  const normalizedPrincipal = { id: principal.id, email: principal.email.toLowerCase() };
  return {
    contract: 'SIGNED_METRIC_EVALUATION_V1',
    principalId: normalizedPrincipal.id,
    principalEmail: normalizedPrincipal.email,
    result,
    integrity: hmac(secret, signingPayload(normalizedPrincipal, result)),
  };
}

export function verifyMetricEvaluation(
  envelope: SignedMetricEvaluationV1,
  principal: AnalyticsPrincipal,
  secret: string,
): MetricResultV1 {
  if (!secret) throw new EvaluationIntegrityError('Analytics evaluation signing unavailable');
  if (!envelope || envelope.contract !== 'SIGNED_METRIC_EVALUATION_V1') {
    throw new EvaluationIntegrityError('Unsupported analytics evaluation envelope');
  }

  const normalizedPrincipal = { id: principal.id, email: principal.email.toLowerCase() };
  if (envelope.principalId !== normalizedPrincipal.id || envelope.principalEmail !== normalizedPrincipal.email) {
    throw new EvaluationIntegrityError('Analytics evaluation belongs to another principal');
  }

  const expected = hmac(secret, signingPayload(normalizedPrincipal, envelope.result));
  const provided = envelope.integrity;
  if (!/^[0-9a-f]{64}$/.test(provided)) throw new EvaluationIntegrityError('Analytics evaluation integrity is invalid');
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'))) {
    throw new EvaluationIntegrityError('Analytics evaluation integrity mismatch');
  }

  return envelope.result;
}
