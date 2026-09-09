import type { SupabaseClient } from '@supabase/supabase-js';

export type CheckinMetricPeriod = {
  start: string;
  end: string;
};

export type CompletedCheckinObservation = {
  id: string;
  status: 'COMPLETED';
  completedAt: string;
};

export type CheckinSourceAdapter = {
  readCompleted(period: CheckinMetricPeriod): Promise<readonly CompletedCheckinObservation[]>;
  readCanonicalById(id: string): Promise<CompletedCheckinObservation | null>;
};

export type CheckinSourceReadErrorCode =
  | 'INVALID_PERIOD'
  | 'SOURCE_QUERY_FAILED'
  | 'SOURCE_COUNT_UNAVAILABLE'
  | 'SOURCE_TRUNCATED_OR_CHANGED'
  | 'SOURCE_ROW_INVALID'
  | 'DUPLICATE_OBSERVATION_ID';

export class CheckinSourceReadError extends Error {
  readonly code: CheckinSourceReadErrorCode;

  constructor(code: CheckinSourceReadErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CheckinSourceReadError';
    this.code = code;
  }
}

export type CheckinPageSource = {
  readExactCount(period: CheckinMetricPeriod): Promise<number>;
  readPage(period: CheckinMetricPeriod, from: number, to: number): Promise<readonly unknown[]>;
};

const DEFAULT_PAGE_SIZE = 500;
const SOURCE_FIELDS = 'id,status,completed_at';

function validatePeriod(period: CheckinMetricPeriod) {
  const startMs = Date.parse(period.start);
  const endMs = Date.parse(period.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new CheckinSourceReadError('INVALID_PERIOD', 'Check-in metric period must have valid start < end');
  }
}

function normalizeRow(row: unknown): CompletedCheckinObservation {
  if (!row || typeof row !== 'object') {
    throw new CheckinSourceReadError('SOURCE_ROW_INVALID', 'Check-in source returned a non-object row');
  }

  const raw = row as Record<string, unknown>;
  if ((typeof raw.id !== 'string' && typeof raw.id !== 'number') || raw.id === '') {
    throw new CheckinSourceReadError('SOURCE_ROW_INVALID', 'Check-in source row is missing id');
  }
  if (raw.status !== 'COMPLETED') {
    throw new CheckinSourceReadError('SOURCE_ROW_INVALID', `Unexpected Check-in status for ${String(raw.id)}`);
  }
  if (typeof raw.completed_at !== 'string' || !Number.isFinite(Date.parse(raw.completed_at))) {
    throw new CheckinSourceReadError('SOURCE_ROW_INVALID', `Completed Check-in ${String(raw.id)} is missing usable completed_at`);
  }

  return { id: String(raw.id), status: 'COMPLETED', completedAt: raw.completed_at };
}

export async function readCompletedCheckinsExhaustively(
  source: CheckinPageSource,
  period: CheckinMetricPeriod,
  options: { pageSize?: number } = {},
): Promise<readonly CompletedCheckinObservation[]> {
  validatePeriod(period);
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('Check-in source pageSize must be a positive integer');

  const expectedCount = await source.readExactCount(period);
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
    throw new CheckinSourceReadError('SOURCE_COUNT_UNAVAILABLE', 'Exact Check-in source count is unavailable');
  }

  const observations: CompletedCheckinObservation[] = [];
  const seenIds = new Set<string>();

  for (let offset = 0; offset < expectedCount; offset += pageSize) {
    const expectedPageLength = Math.min(pageSize, expectedCount - offset);
    const rows = await source.readPage(period, offset, offset + expectedPageLength - 1);
    if (rows.length !== expectedPageLength) {
      throw new CheckinSourceReadError(
        'SOURCE_TRUNCATED_OR_CHANGED',
        `Expected ${expectedPageLength} Check-in rows at offset ${offset}, received ${rows.length}`,
      );
    }

    for (const raw of rows) {
      const observation = normalizeRow(raw);
      if (seenIds.has(observation.id)) {
        throw new CheckinSourceReadError('DUPLICATE_OBSERVATION_ID', `Duplicate checkins.id in exhaustive source read: ${observation.id}`);
      }
      seenIds.add(observation.id);
      observations.push(observation);
    }
  }

  if (observations.length !== expectedCount) {
    throw new CheckinSourceReadError('SOURCE_TRUNCATED_OR_CHANGED', `Expected ${expectedCount} Check-ins, assembled ${observations.length}`);
  }

  const finalCount = await source.readExactCount(period);
  if (finalCount !== expectedCount) {
    throw new CheckinSourceReadError(
      'SOURCE_TRUNCATED_OR_CHANGED',
      `Check-in population changed during exhaustive read: initial ${expectedCount}, final ${finalCount}`,
    );
  }

  return observations;
}

function createSupabaseCheckinPageSource(client: SupabaseClient): CheckinPageSource {
  return {
    async readExactCount(period) {
      const { count, error } = await client
        .from('checkins')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'COMPLETED')
        .gte('completed_at', period.start)
        .lt('completed_at', period.end);

      if (error) throw new CheckinSourceReadError('SOURCE_QUERY_FAILED', 'Failed to count completed Check-ins', { cause: error });
      if (count == null) throw new CheckinSourceReadError('SOURCE_COUNT_UNAVAILABLE', 'Exact Check-in source count is unavailable');
      return count;
    },

    async readPage(period, from, to) {
      const { data, error } = await client
        .from('checkins')
        .select(SOURCE_FIELDS)
        .eq('status', 'COMPLETED')
        .gte('completed_at', period.start)
        .lt('completed_at', period.end)
        .order('completed_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);

      if (error) throw new CheckinSourceReadError('SOURCE_QUERY_FAILED', `Failed to read completed Check-ins range ${from}-${to}`, { cause: error });
      if (!Array.isArray(data)) throw new CheckinSourceReadError('SOURCE_QUERY_FAILED', 'Check-in source returned no row array');
      return data;
    },
  };
}

export function createSupabaseCheckinSourceAdapter(client: SupabaseClient, options: { pageSize?: number } = {}): CheckinSourceAdapter {
  const pageSource = createSupabaseCheckinPageSource(client);
  return {
    readCompleted(period) {
      return readCompletedCheckinsExhaustively(pageSource, period, options);
    },

    async readCanonicalById(id) {
      if (!id) throw new CheckinSourceReadError('SOURCE_ROW_INVALID', 'Traceback requires exact checkins.id');
      const { data, error } = await client
        .from('checkins')
        .select(SOURCE_FIELDS)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new CheckinSourceReadError('SOURCE_QUERY_FAILED', `Failed to read canonical Check-in ${id}`, { cause: error });
      if (data == null) return null;
      return normalizeRow(data);
    },
  };
}
