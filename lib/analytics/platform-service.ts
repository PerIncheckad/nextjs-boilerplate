import type { MetricResultV1 } from './contracts';
import {
  CHECKIN_COMPLETED_COUNT_METRIC_ID,
  CHECKIN_COMPLETED_COUNT_VERSION,
  evaluateCheckinCompletedCount,
} from './evaluators/checkin-completed-count';
import {
  LAYER1_PERIOD_DURATION_HOURS_METRIC_ID,
  LAYER1_PERIOD_DURATION_HOURS_VERSION,
  evaluateLayer1PeriodDurationHours,
} from './evaluators/layer1-period-duration';
import type { CheckinMetricPeriod, CheckinSourceAdapter } from './source-adapters/checkin';
import type { Layer1MetricPeriod, Layer1PeriodSourceAdapter } from './source-adapters/layer1-period';

export type CheckinMetricEvaluationRequest = {
  metricId: typeof CHECKIN_COMPLETED_COUNT_METRIC_ID;
  metricVersion: typeof CHECKIN_COMPLETED_COUNT_VERSION;
  period: CheckinMetricPeriod;
  engineBuildSha: string;
  calculatedAt?: string;
  evaluationId?: string;
};

export type Layer1DurationMetricEvaluationRequest = {
  metricId: typeof LAYER1_PERIOD_DURATION_HOURS_METRIC_ID;
  metricVersion: typeof LAYER1_PERIOD_DURATION_HOURS_VERSION;
  period: Layer1MetricPeriod;
  engineBuildSha: string;
  calculatedAt?: string;
  evaluationId?: string;
};

export type MetricEvaluationRequest = CheckinMetricEvaluationRequest | Layer1DurationMetricEvaluationRequest;

export type MetricPlatformSources = {
  checkin?: CheckinSourceAdapter;
  layer1Period?: Layer1PeriodSourceAdapter;
};

/** Server-side platform boundary for explicitly approved metric execution only. */
export async function evaluateMetric(
  request: MetricEvaluationRequest,
  sources: MetricPlatformSources,
): Promise<MetricResultV1> {
  if (request.metricId === CHECKIN_COMPLETED_COUNT_METRIC_ID && request.metricVersion === CHECKIN_COMPLETED_COUNT_VERSION) {
    if (!sources.checkin) throw new Error('Check-in source is required for CHECKIN_COMPLETED_COUNT v1');
    return evaluateCheckinCompletedCount({
      source: sources.checkin,
      period: request.period,
      engineBuildSha: request.engineBuildSha,
      calculatedAt: request.calculatedAt,
      evaluationId: request.evaluationId,
    });
  }

  if (request.metricId === LAYER1_PERIOD_DURATION_HOURS_METRIC_ID && request.metricVersion === LAYER1_PERIOD_DURATION_HOURS_VERSION) {
    if (!sources.layer1Period) throw new Error('Layer 1 period source is required for LAYER1_PERIOD_DURATION_HOURS v1');
    return evaluateLayer1PeriodDurationHours({
      source: sources.layer1Period,
      period: request.period,
      engineBuildSha: request.engineBuildSha,
      calculatedAt: request.calculatedAt,
      evaluationId: request.evaluationId,
    });
  }

  const unsupported = request as { metricId: string; metricVersion: number };
  throw new Error(`Unsupported metric execution: ${unsupported.metricId}@${unsupported.metricVersion}`);
}
