import { randomUUID } from 'node:crypto';
import { coverageQuality, count } from '../statistics';
import { definitionFingerprint } from '../fingerprint';
import { getMetricContract } from '../registry';
import type { MetricResultV1 } from '../contracts';
import type { CheckinSourceAdapter, CheckinMetricPeriod } from '../source-adapters/checkin';

export const CHECKIN_COMPLETED_COUNT_METRIC_ID = 'CHECKIN_COMPLETED_COUNT' as const;
export const CHECKIN_COMPLETED_COUNT_VERSION = 1 as const;

export type CheckinCompletedCountEvaluationInput = {
  source: CheckinSourceAdapter;
  period: CheckinMetricPeriod;
  engineBuildSha: string;
  calculatedAt?: string;
  evaluationId?: string;
};

function requireIsoInstant(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} must be a valid ISO timestamp`);
  return value;
}

export async function evaluateCheckinCompletedCount(
  input: CheckinCompletedCountEvaluationInput,
): Promise<MetricResultV1> {
  const contract = getMetricContract(CHECKIN_COMPLETED_COUNT_METRIC_ID, CHECKIN_COMPLETED_COUNT_VERSION);
  if (!contract) throw new Error('CHECKIN_COMPLETED_COUNT v1 contract is missing from Metric Registry');

  const calculatedAt = requireIsoInstant(input.calculatedAt ?? new Date().toISOString(), 'calculatedAt');
  const observations = await input.source.readCompleted(input.period);
  const n = count(observations);
  const quality = coverageQuality({ maturity: 'VERIFIED', n, missingDataN: 0, denominatorKnown: true });

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
        observationIdentity: observation.id,
        sourceOwner: contract.sourceOwner,
        sourceEntity: 'checkins',
        sourceRecordId: observation.id,
        sourceEventId: null,
        sourceBusinessTimestamp: observation.completedAt,
      })),
    },
    value: n,
    unit: contract.unit,
    statistics: {
      n,
      sum: null,
      mean: null,
      median: null,
      p90: null,
    },
    quality,
  };
}
