export type MetricMaturity = 'VERIFIED' | 'PARTIAL' | 'BLOCKED' | 'NOT_AVAILABLE';
export type MetricUnit = 'COUNT' | 'HOURS' | 'PERCENT' | 'DAYS' | 'SEK';
export type MetricType = 'EVENT_COUNT' | 'COMPLETION_COHORT_DURATION' | 'CASE_LEAD_TIME' | 'CURRENT_STATE_COUNT' | 'CURRENT_OWNERSHIP_COUNT' | 'CROSS_SOURCE_REMAINING_COUNT' | 'RATE' | 'RATIO' | 'STATE_EXPOSURE' | 'DISTRIBUTION' | 'CYCLE_COUNT' | 'CYCLE_DURATION' | 'INTER_CYCLE_DURATION';
export type TimeBasis = 'EVENT_TIME' | 'COMPLETION_TIME' | 'START_END_DURATION' | 'CURRENT_SNAPSHOT' | 'BUSINESS_PERIOD_DIMENSION';
export type AnalyticsCapability = 'AGGREGATE' | 'DRILL_DOWN' | 'SOURCE_CONTRIBUTOR' | 'EXPORT';
export type AnalyticsConsumer = 'REPORTING' | 'TOWER' | 'AI';
export type ContributorClassification = 'INCLUDED' | 'EXCLUDED' | 'MISSING_DATA' | 'BLOCKED';
export type ComparisonQualityReason = 'ZERO_COMPARISON_BASE' | 'INCOMPATIBLE_SCOPE' | 'INCOMPATIBLE_UNIT' | 'INCOMPATIBLE_METRIC';

export type MetricDimensionContract = {
  id: string;
  businessMeaning: string;
  sourceSemantic: string;
  historicalSemantics: 'EVENT_SNAPSHOT' | 'CURRENT_ONLY' | 'BUSINESS_PERIOD' | 'IDENTITY';
  missingHandling: 'SAKNAS' | 'NOT_ALLOWED';
};

export type MetricContractV1 = {
  metricId: string;
  version: 1;
  name: string;
  metricType: MetricType;
  unit: MetricUnit;
  businessQuestion: string;
  businessDefinition: string;
  population: string;
  observationIdentity: string;
  inclusions: readonly string[];
  exclusions: readonly string[];
  numerator: string;
  denominator: string;
  sourceOwner: string;
  sourceEntities: readonly string[];
  sourceIdentityFields: readonly string[];
  requiredSourceFields: readonly string[];
  sourceTruthBoundary: readonly string[];
  timeBasis: TimeBasis;
  startTime: string;
  endTime: string;
  periodAttribution: string;
  dimensions: readonly MetricDimensionContract[];
  openCaseTreatment: string;
  statisticalOutputs: readonly string[];
  maturityRule: string;
  tracebackContract: string;
  knownLimitations: readonly string[];
};

export type CycleDefinitionContract = {
  cycleDefinitionId: string;
  version: number;
  businessMeaning: string;
  cycleIdentity: string;
  allowedSourceOwners: readonly string[];
  allowedSourceEventsOrPeriods: readonly string[];
  startRule: string;
  endRule: string;
  sequenceRule: string;
  ambiguityRule: 'BLOCKED';
  overlapRule: string;
  openCycleTreatment: string;
  exclusionRules: readonly string[];
  maturityPropagation: string;
  tracebackContract: string;
};

export type ExactRational = { numerator: bigint; denominator: bigint };
export type DurationMicros = bigint & { readonly __durationMicros: unique symbol };
export type EpochMicros = bigint & { readonly __epochMicros: unique symbol };

export type MetricQuality = {
  maturity: MetricMaturity;
  excludedN: number;
  missingDataN: number;
  blockedN: number;
  coverage: number | null;
  coverageBasisN: number | null;
  reasons: readonly string[];
};

export type ContributorIdentity = {
  classification: ContributorClassification;
  observationIdentity: string;
  sourceOwner: string;
  sourceEntity: string;
  sourceRecordId: string;
  sourceEventId?: string | null;
};

export type EvaluationContract = {
  evaluationId: string;
  calculatedAt: string;
  asOf: string | null;
  contributorSetBoundToEvaluation: true;
  contributors: readonly ContributorIdentity[];
};

export type MetricResultV1 = {
  resultContract: 'METRIC_RESULT_V1';
  metricId: string;
  metricVersion: number;
  definitionFingerprint: string;
  engineBuildSha: string;
  scope: {
    periodStart: string | null;
    periodEnd: string | null;
    timezone: 'Europe/Stockholm';
    intervalSemantics: '[start,end)';
    periodCode: string | null;
    dimensions: readonly string[];
    filters: Readonly<Record<string, string | number | boolean | null>>;
  };
  evaluation: EvaluationContract;
  value: number | null;
  unit: MetricUnit;
  statistics: {
    n: number;
    sum: number | null;
    mean: number | null;
    median: number | null;
    p90: number | null;
  };
  quality: MetricQuality;
};

export type ComparisonResult = {
  absoluteDifference: number | null;
  relativeChangePct: number | null;
  maturity: MetricMaturity;
  reasons: readonly string[];
};

export type AuthorizationContext = {
  capabilities: ReadonlySet<AnalyticsCapability>;
  consumers: ReadonlySet<AnalyticsConsumer>;
  sourceAccessAllowed: boolean;
};
