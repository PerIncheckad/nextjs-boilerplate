import type { MetricResultV1 } from './contracts';
import {
  CHECKIN_COMPLETED_COUNT_METRIC_ID,
  CHECKIN_COMPLETED_COUNT_VERSION,
  evaluateCheckinCompletedCount,
} from './evaluators/checkin-completed-count';
import type { CheckinMetricPeriod, CheckinSourceAdapter } from './source-adapters/checkin';

export type MetricEvaluationRequest = {
  metricId: typeof CHECKIN_COMPLETED_COUNT_METRIC_ID;
  metricVersion: typeof CHECKIN_COMPLETED_COUNT_VERSION;
  period: CheckinMetricPeriod;
  engineBuildSha: string;
  calculatedAt?: string;
  evaluationId?: string;
};

export type MetricPlatformSources = {
  checkin: CheckinSourceAdapter;
};

/**
 * Server-side platform boundary for approved metric execution.
 * RPT-02 intentionally exposes only CHECKIN_COMPLETED_COUNT v1.
 * Authentication/consumer grants/traceback services remain RPT-03 scope.
 */
export async function evaluateMetric(
  request: MetricEvaluationRequest,
  sources: MetricPlatformSources,
): Promise<MetricResultV1> {
  if (request.metricId !== CHECKIN_COMPLETED_COUNT_METRIC_ID || request.metricVersion !== CHECKIN_COMPLETED_COUNT_VERSION) {
    throw new Error(`Unsupported metric execution in RPT-02: ${request.metricId}@${request.metricVersion}`);
  }

  return evaluateCheckinCompletedCount({
    source: sources.checkin,
    period: request.period,
    engineBuildSha: request.engineBuildSha,
    calculatedAt: request.calculatedAt,
    evaluationId: request.evaluationId,
  });
}
