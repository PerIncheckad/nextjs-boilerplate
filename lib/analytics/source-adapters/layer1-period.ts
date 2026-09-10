import type { SupabaseClient } from '@supabase/supabase-js';
import { parseTimestampMicros } from '../timestamp-micros';
import type { EpochMicros } from '../contracts';

export type Layer1MetricPeriod = { start: string; end: string };

export type ClosedLayer1PeriodObservation = {
  periodId: string;
  periodType: string;
  startedAt: string;
  endedAt: string;
  startedAtMicros: EpochMicros;
  endedAtMicros: EpochMicros;
  reasonCode: string | null;
  sourceSystem: string | null;
  sourceEntity: string | null;
  sourceRecordId: string | null;
  sourceEventId: string | null;
};

export type Layer1PeriodSourceAdapter = {
  readCompleted(period: Layer1MetricPeriod): Promise<readonly ClosedLayer1PeriodObservation[]>;
};

export type Layer1PeriodReadErrorCode =
  | 'INVALID_PERIOD'
  | 'SOURCE_QUERY_FAILED'
  | 'SOURCE_COUNT_UNAVAILABLE'
  | 'SOURCE_TRUNCATED_OR_CHANGED'
  | 'SOURCE_ROW_INVALID'
  | 'BACKWARD_CHRONOLOGY'
  | 'DUPLICATE_OBSERVATION_ID';

export class Layer1PeriodReadError extends Error {
  readonly code: Layer1PeriodReadErrorCode;
  constructor(code: Layer1PeriodReadErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'Layer1PeriodReadError';
    this.code = code;
  }
}

export type Layer1PeriodPageSource = {
  readExactCount(period: Layer1MetricPeriod): Promise<number>;
  readPage(period: Layer1MetricPeriod, from: number, to: number): Promise<readonly unknown[]>;
};

const DEFAULT_PAGE_SIZE = 500;
const SOURCE_FIELDS = 'period_id,period_type,started_at,ended_at,reason_code,source_system,source_entity,source_record_id,source_event_id';

function validatePeriod(period: Layer1MetricPeriod) {
  const startMs = Date.parse(period.start);
  const endMs = Date.parse(period.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new Layer1PeriodReadError('INVALID_PERIOD', 'Layer 1 metric period must have valid start < end');
  }
}

function normalizeRow(row: unknown): ClosedLayer1PeriodObservation {
  if (!row || typeof row !== 'object') throw new Layer1PeriodReadError('SOURCE_ROW_INVALID', 'Layer 1 source returned a non-object row');
  const raw = row as Record<string, unknown>;
  if (typeof raw.period_id !== 'string' || raw.period_id === '') throw new Layer1PeriodReadError('SOURCE_ROW_INVALID', 'Layer 1 source row is missing period_id');
  if (typeof raw.period_type !== 'string' || raw.period_type === '') throw new Layer1PeriodReadError('SOURCE_ROW_INVALID', `Layer 1 period ${raw.period_id} is missing period_type`);
  if (typeof raw.started_at !== 'string' || typeof raw.ended_at !== 'string') {
    throw new Layer1PeriodReadError('SOURCE_ROW_INVALID', `Layer 1 period ${raw.period_id} is missing start/end timestamp`);
  }
  let startedAtMicros: EpochMicros;
  let endedAtMicros: EpochMicros;
  try {
    startedAtMicros = parseTimestampMicros(raw.started_at);
    endedAtMicros = parseTimestampMicros(raw.ended_at);
  } catch (error) {
    throw new Layer1PeriodReadError('SOURCE_ROW_INVALID', `Layer 1 period ${raw.period_id} has invalid timestamp precision`, { cause: error });
  }
  if (endedAtMicros < startedAtMicros) throw new Layer1PeriodReadError('BACKWARD_CHRONOLOGY', `Layer 1 period ${raw.period_id} ends before it starts`);

  return {
    periodId: raw.period_id,
    periodType: raw.period_type,
    startedAt: raw.started_at,
    endedAt: raw.ended_at,
    startedAtMicros,
    endedAtMicros,
    reasonCode: typeof raw.reason_code === 'string' ? raw.reason_code : null,
    sourceSystem: typeof raw.source_system === 'string' ? raw.source_system : null,
    sourceEntity: typeof raw.source_entity === 'string' ? raw.source_entity : null,
    sourceRecordId: typeof raw.source_record_id === 'string' ? raw.source_record_id : null,
    sourceEventId: typeof raw.source_event_id === 'string' ? raw.source_event_id : null,
  };
}

export async function readClosedLayer1PeriodsExhaustively(
  source: Layer1PeriodPageSource,
  period: Layer1MetricPeriod,
  options: { pageSize?: number } = {},
): Promise<readonly ClosedLayer1PeriodObservation[]> {
  validatePeriod(period);
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('Layer 1 source pageSize must be a positive integer');

  const expectedCount = await source.readExactCount(period);
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) throw new Layer1PeriodReadError('SOURCE_COUNT_UNAVAILABLE', 'Exact Layer 1 source count is unavailable');

  const observations: ClosedLayer1PeriodObservation[] = [];
  const seenIds = new Set<string>();
  for (let offset = 0; offset < expectedCount; offset += pageSize) {
    const expectedPageLength = Math.min(pageSize, expectedCount - offset);
    const rows = await source.readPage(period, offset, offset + expectedPageLength - 1);
    if (rows.length !== expectedPageLength) {
      throw new Layer1PeriodReadError('SOURCE_TRUNCATED_OR_CHANGED', `Expected ${expectedPageLength} Layer 1 rows at offset ${offset}, received ${rows.length}`);
    }
    for (const raw of rows) {
      const observation = normalizeRow(raw);
      if (seenIds.has(observation.periodId)) throw new Layer1PeriodReadError('DUPLICATE_OBSERVATION_ID', `Duplicate period_id in exhaustive source read: ${observation.periodId}`);
      seenIds.add(observation.periodId);
      observations.push(observation);
    }
  }

  if (observations.length !== expectedCount) throw new Layer1PeriodReadError('SOURCE_TRUNCATED_OR_CHANGED', `Expected ${expectedCount} Layer 1 periods, assembled ${observations.length}`);
  const finalCount = await source.readExactCount(period);
  if (finalCount !== expectedCount) throw new Layer1PeriodReadError('SOURCE_TRUNCATED_OR_CHANGED', `Layer 1 population changed during exhaustive read: initial ${expectedCount}, final ${finalCount}`);
  return observations;
}

function createSupabaseLayer1PeriodPageSource(client: SupabaseClient): Layer1PeriodPageSource {
  return {
    async readExactCount(period) {
      const { count, error } = await client
        .from('vehicle_journey_periods')
        .select('period_id', { count: 'exact', head: true })
        .not('ended_at', 'is', null)
        .gte('ended_at', period.start)
        .lt('ended_at', period.end)
        .filter('ended_at', 'gte', 'started_at');
      if (error) throw new Layer1PeriodReadError('SOURCE_QUERY_FAILED', 'Failed to count closed Layer 1 periods', { cause: error });
      if (count == null) throw new Layer1PeriodReadError('SOURCE_COUNT_UNAVAILABLE', 'Exact Layer 1 source count is unavailable');
      return count;
    },
    async readPage(period, from, to) {
      const { data, error } = await client
        .from('vehicle_journey_periods')
        .select(SOURCE_FIELDS)
        .not('ended_at', 'is', null)
        .gte('ended_at', period.start)
        .lt('ended_at', period.end)
        .filter('ended_at', 'gte', 'started_at')
        .order('ended_at', { ascending: true })
        .order('period_id', { ascending: true })
        .range(from, to);
      if (error) throw new Layer1PeriodReadError('SOURCE_QUERY_FAILED', `Failed to read closed Layer 1 periods range ${from}-${to}`, { cause: error });
      if (!Array.isArray(data)) throw new Layer1PeriodReadError('SOURCE_QUERY_FAILED', 'Layer 1 source returned no row array');
      return data;
    },
  };
}

export function createSupabaseLayer1PeriodSourceAdapter(client: SupabaseClient, options: { pageSize?: number } = {}): Layer1PeriodSourceAdapter {
  const pageSource = createSupabaseLayer1PeriodPageSource(client);
  return {
    readCompleted(period) {
      return readClosedLayer1PeriodsExhaustively(pageSource, period, options);
    },
  };
}
