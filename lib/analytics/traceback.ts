import type { ContributorIdentity, MetricResultV1 } from './contracts';
import type { CheckinTracebackSourceAdapter, CompletedCheckinObservation } from './source-adapters/checkin';

export type CheckinTracebackResultV1 = {
  contract: 'CHECKIN_TRACEBACK_V1';
  evaluationId: string;
  contributor: ContributorIdentity;
  source: {
    id: string;
    status: 'COMPLETED';
    completed_at: string;
  };
};

export class TracebackDeniedError extends Error {
  readonly code:
    | 'UNSUPPORTED_METRIC'
    | 'INVALID_EVALUATION'
    | 'CONTRIBUTOR_NOT_BOUND'
    | 'INVALID_SOURCE_IDENTITY'
    | 'SOURCE_ROW_NOT_FOUND'
    | 'SOURCE_PROVENANCE_MISMATCH';

  constructor(code: TracebackDeniedError['code'], message: string) {
    super(message);
    this.name = 'TracebackDeniedError';
    this.code = code;
  }
}

function assertSupportedResult(result: MetricResultV1) {
  if (result.metricId !== 'CHECKIN_COMPLETED_COUNT' || result.metricVersion !== 1) {
    throw new TracebackDeniedError('UNSUPPORTED_METRIC', 'Traceback is only available for CHECKIN_COMPLETED_COUNT v1');
  }
  if (result.resultContract !== 'METRIC_RESULT_V1' || result.evaluation.contributorSetBoundToEvaluation !== true) {
    throw new TracebackDeniedError('INVALID_EVALUATION', 'Metric evaluation contract is not valid for traceback');
  }
}

function findContributor(result: MetricResultV1, contributorId: string): ContributorIdentity {
  const matches = result.evaluation.contributors.filter((candidate) => candidate.observationIdentity === contributorId);
  if (matches.length !== 1) {
    throw new TracebackDeniedError('CONTRIBUTOR_NOT_BOUND', 'Contributor is not uniquely bound to this evaluation');
  }

  const contributor = matches[0];
  if (
    contributor.classification !== 'INCLUDED'
    || contributor.sourceOwner !== 'CHECKIN'
    || contributor.sourceEntity !== 'checkins'
    || contributor.sourceRecordId !== contributor.observationIdentity
    || contributor.sourceRecordId !== contributorId
    || typeof contributor.sourceBusinessTimestamp !== 'string'
  ) {
    throw new TracebackDeniedError('INVALID_SOURCE_IDENTITY', 'Contributor lacks exact canonical Check-in source identity');
  }
  return contributor;
}

function assertCanonicalSourceMatches(contributor: ContributorIdentity, source: CompletedCheckinObservation) {
  if (
    source.id !== contributor.sourceRecordId
    || source.status !== 'COMPLETED'
    || source.completedAt !== contributor.sourceBusinessTimestamp
  ) {
    throw new TracebackDeniedError('SOURCE_PROVENANCE_MISMATCH', 'Canonical Check-in source row no longer matches evaluation provenance');
  }
}

export async function tracebackCheckinContributor(input: {
  result: MetricResultV1;
  contributorId: string;
  source: CheckinTracebackSourceAdapter;
}): Promise<CheckinTracebackResultV1> {
  assertSupportedResult(input.result);
  const contributor = findContributor(input.result, input.contributorId);
  const source = await input.source.readCanonicalById(contributor.sourceRecordId);
  if (!source) throw new TracebackDeniedError('SOURCE_ROW_NOT_FOUND', 'Canonical Check-in source row was not found');
  assertCanonicalSourceMatches(contributor, source);

  return {
    contract: 'CHECKIN_TRACEBACK_V1',
    evaluationId: input.result.evaluation.evaluationId,
    contributor,
    source: {
      id: source.id,
      status: source.status,
      completed_at: source.completedAt,
    },
  };
}
