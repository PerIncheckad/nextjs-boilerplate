import { randomUUID } from 'node:crypto';
import { definitionFingerprint } from '../fingerprint';
import { getMetricContract } from '../registry';
import {
  coverageQuality,
  exactDuration,
  meanExact,
  medianExact,
  p90Exact,
  rational,
  rationalToNumber,
  sumExact,
} from '../statistics';
import type { ExactRational, MetricResultV1 } from '../contracts';
import type { Layer1MetricPeriod, Layer1PeriodSourceAdapter } from '../source-adapters/layer1-period';

export const LAYER1_PERIOD_DURATION_HOURS_METRIC_ID = 'LAYER1_PERIOD_DURATION_HOURS' as const;
export const LAYER1_PERIOD_DURATION_HOURS_VERSION = 1 as const;

const MICROS_PER_HOUR = 3_600_000_000n;

export type Layer1PeriodDurationEvaluationInput = {
  source: Layer1PeriodSourceAdapter;
  period: Layer1MetricPeriod;
  engineBuildSha: string;
  calculatedAt?: string;
  evaluationId?: string;
};

function requireIsoInstant(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} must be a valid ISO timestamp`);
  return value;
}

function microsRationalToHours(value: ExactRational | null): number | null {
  if (value == null) return null;
  return rationalToNumber(rational(value.numerator, value.denominator * MICROS_PER_HOUR));
}

export async function evaluateLayer1PeriodDurationHours(
  input: Layer1PeriodDurationEvaluationInput,
): Promise<MetricResultV1> {
  const contract = getMetricContract(LAYER1_PERIOD_DURATION_HOURS_METRIC_ID, LAYER1_PERIOD_DURATION_HOURS_VERSION);
  if (!contract) throw new Error('LAYER1_PERIOD_DURATION_HOURS v1 contract is missing from Metric Registry');

  const calculatedAt = requireIsoInstant(input.calculatedAt ?? new Date().toISOString(), 'calculatedAt');
  const observations = await input.source.readCompleted(input.period);
  const durations = observations.map((observation) => {
    const duration = exactDuration(observation.startedAtMicros, observation.endedAtMicros);
    if (duration == null) throw new Error(`Layer 1 source chronology changed after validation: ${observation.periodId}`);
    return duration;
  });

  const n = durations.length;
  const sumMicros = sumExact(durations);
  const sum = n === 0 ? null : microsRationalToHours(rational(sumMicros));
  const mean = microsRationalToHours(meanExact(durations));
  const median = microsRationalToHours(medianExact(durations));
  const p90 = microsRationalToHours(p90Exact(durations));

  const quality = coverageQuality({
    maturity: 'PARTIAL',
    n,
    missingDataN: 0,
    denominatorKnown: false,
    reasons: ['LAYER1_HISTORICAL_SOURCE_COVERAGE_INCOMPLETE'],
  });

  return {
    resultContract: 'METRIC_RESULT_V1',
    metricId: contract.metricId,
    metricVersion: contract.version,
    definitionFingerprint: definitionFingerprint(contract),
    engineBuildSha: input.engineBuildSha,
    scope: {
      periodStart: input.period.start,
      periodEnd: input.period.end,
      timezone: 'Europe/Stockholm',
      intervalSemantics: '[start,end)',
      periodCode: null,
      dimensions: [],
      filters: {},
    },
    evaluation: {
      evaluationId: input.evaluationId ?? randomUUID(),
      calculatedAt,
      asOf: null,
      contributorSetBoundToEvaluation: true,
      contributors: observations.map((observation) => ({
        classification: 'INCLUDED' as const,
        observationIdentity: observation.periodId,
        sourceOwner: contract.sourceOwner,
        sourceEntity: 'vehicle_journey_periods',
        sourceRecordId: observation.periodId,
        sourceEventId: observation.sourceEventId,
        sourceBusinessTimestamp: observation.endedAt,
      })),
    },
    value: mean,
    unit: contract.unit,
    statistics: { n, sum, mean, median, p90 },
    quality,
  };
}
