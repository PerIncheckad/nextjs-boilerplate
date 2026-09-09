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

async function readExactCount(client: SupabaseClient, period: CheckinMetricPeriod): Promise<number> {
  const { count, error } = await client
    .from('checkins')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'COMPLETED')
    .gte('completed_at', period.start)
    .lt('completed_at', period.end);

  if (error) throw new CheckinSourceReadError('SOURCE_QUERY_FAILED', 'Failed to count completed Check-ins', { cause: error });
  if (count == null) throw new CheckinSourceReadError('SOURCE_COUNT_UNAVAILABLE', 'Exact Check-in source count is unavailable');
  return count;
}

async function readPage(client: SupabaseClient, period: CheckinMetricPeriod, from: number, to: number, includeExactCount: boolean) {
  const base = client.from('checkins');
  const selected = includeExactCount
    ? base.select(SOURCE_FIELDS, { count: 'exact' })
    : base.select(SOURCE_FIELDS);

  const { data, error, count } = await selected
    .eq('status', 'COMPLETED')
    .gte('completed_at', period.start)
    .lt('completed_at', period.end)
    .order('completed_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to);

  if (error) throw new CheckinSourceReadError('SOURCE_QUERY_FAILED', `Failed to read completed Check-ins range ${from}-${to}`, { cause: error });
  if (!Array.isArray(data)) throw new CheckinSourceReadError('SOURCE_QUERY_FAILED', 'Check-in source returned no row array');
  return { data, exactCount: count ?? null };
}

export function createSupabaseCheckinSourceAdapter(client: SupabaseClient, options: { pageSize?: number } = {}): CheckinSourceAdapter {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('Check-in source pageSize must be a positive integer');

  return {
    async readCompleted(period) {
      validatePeriod(period);

      const first = await readPage(client, period, 0, pageSize - 1, true);
      if (first.exactCount == null) {
        throw new CheckinSourceReadError('SOURCE_COUNT_UNAVAILABLE', 'Exact Check-in source count is unavailable');
      }

      const expectedCount = first.exactCount;
      const observations: CompletedCheckinObservation[] = [];
      const seenIds = new Set<string>();

      let offset = 0;
      let page = first;
      while (offset < expectedCount) {
        const expectedPageLength = Math.min(pageSize, expectedCount - offset);
        if (page.data.length !== expectedPageLength) {
          throw new CheckinSourceReadError(
            'SOURCE_TRUNCATED_OR_CHANGED',
            `Expected ${expectedPageLength} Check-in rows at offset ${offset}, received ${page.data.length}`,
          );
        }

        for (const raw of page.data) {
          const observation = normalizeRow(raw);
          if (seenIds.has(observation.id)) {
            throw new CheckinSourceReadError('DUPLICATE_OBSERVATION_ID', `Duplicate checkins.id in exhaustive source read: ${observation.id}`);
          }
          seenIds.add(observation.id);
          observations.push(observation);
        }

        offset += page.data.length;
        if (offset < expectedCount) {
          page = await readPage(client, period, offset, offset + pageSize - 1, false);
        }
      }

      if (observations.length !== expectedCount) {
        throw new CheckinSourceReadError('SOURCE_TRUNCATED_OR_CHANGED', `Expected ${expectedCount} Check-ins, assembled ${observations.length}`);
      }

      const finalCount = await readExactCount(client, period);
      if (finalCount !== expectedCount) {
        throw new CheckinSourceReadError(
          'SOURCE_TRUNCATED_OR_CHANGED',
          `Check-in population changed during exhaustive read: initial ${expectedCount}, final ${finalCount}`,
        );
      }

      return observations;
    },
  };
}
