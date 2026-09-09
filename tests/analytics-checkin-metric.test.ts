import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CheckinSourceReadError,
  createSupabaseCheckinSourceAdapter,
  evaluateMetric,
  getMetricContract,
  definitionFingerprint,
  readCompletedCheckinsExhaustively,
  type CheckinPageSource,
  type CheckinSourceAdapter,
} from '../lib/analytics/index';

const period = {
  start: '2026-09-01T00:00:00.000Z',
  end: '2026-10-01T00:00:00.000Z',
};

type FakeRow = Record<string, unknown>;

class FakeSupabaseQuery {
  private readonly rows: readonly FakeRow[];
  private filters: Array<(row: FakeRow) => boolean> = [];
  private orders: Array<{ field: string; ascending: boolean }> = [];
  private head = false;

  constructor(rows: readonly FakeRow[]) {
    this.rows = rows;
  }

  select(_fields: string, options?: { count?: string; head?: boolean }) {
    this.head = options?.head === true;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  gte(field: string, value: string) {
    this.filters.push((row) => typeof row[field] === 'string' && (row[field] as string) >= value);
    return this;
  }

  lt(field: string, value: string) {
    this.filters.push((row) => typeof row[field] === 'string' && (row[field] as string) < value);
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: options?.ascending !== false });
    return this;
  }

  private filtered() {
    const filtered = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    return [...filtered].sort((a, b) => {
      for (const order of this.orders) {
        const left = String(a[order.field] ?? '');
        const right = String(b[order.field] ?? '');
        const comparison = left.localeCompare(right);
        if (comparison !== 0) return order.ascending ? comparison : -comparison;
      }
      return 0;
    });
  }

  range(from: number, to: number) {
    return Promise.resolve({ data: this.filtered().slice(from, to + 1), count: null, error: null });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const rows = this.filtered();
    const value = this.head
      ? { data: null, count: rows.length, error: null }
      : { data: rows, count: null, error: null };
    return Promise.resolve(value).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(rows: readonly FakeRow[]): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, 'checkins');
      return new FakeSupabaseQuery(rows);
    },
  } as unknown as SupabaseClient;
}

function sourceAdapter(observations: readonly { id: string; status: 'COMPLETED'; completedAt: string }[]): CheckinSourceAdapter {
  return {
    async readCompleted(requestedPeriod) {
      assert.deepEqual(requestedPeriod, period);
      return observations;
    },
  };
}

test('Check-in adapter includes period start, excludes period end and only reads COMPLETED', async () => {
  const adapter = createSupabaseCheckinSourceAdapter(fakeSupabase([
    { id: 'start', status: 'COMPLETED', completed_at: period.start },
    { id: 'inside', status: 'COMPLETED', completed_at: '2026-09-30T23:59:59.999Z' },
    { id: 'end', status: 'COMPLETED', completed_at: period.end },
    { id: 'open', status: 'IN_PROGRESS', completed_at: '2026-09-15T12:00:00.000Z' },
  ]), { pageSize: 1 });

  const rows = await adapter.readCompleted(period);
  assert.deepEqual(rows.map((row) => row.id), ['start', 'inside']);
});

test('duplicate vehicle identity does not collapse distinct checkins.id observations', async () => {
  const adapter = createSupabaseCheckinSourceAdapter(fakeSupabase([
    { id: 'c1', regnr: 'ABC123', status: 'COMPLETED', completed_at: '2026-09-02T10:00:00.000Z' },
    { id: 'c2', regnr: 'ABC123', status: 'COMPLETED', completed_at: '2026-09-03T10:00:00.000Z' },
  ]));
  const rows = await adapter.readCompleted(period);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.id), ['c1', 'c2']);
});

test('damage, created_at and missing station fields never affect Check-in TOTAL', async () => {
  const adapter = createSupabaseCheckinSourceAdapter(fakeSupabase([
    { id: 'c1', status: 'COMPLETED', completed_at: '2026-09-04T10:00:00.000Z', created_at: '1999-01-01', damage_count: 99 },
    { id: 'c2', status: 'COMPLETED', completed_at: '2026-09-05T10:00:00.000Z', current_station: null },
  ]));
  const rows = await adapter.readCompleted(period);
  assert.deepEqual(rows, [
    { id: 'c1', status: 'COMPLETED', completedAt: '2026-09-04T10:00:00.000Z' },
    { id: 'c2', status: 'COMPLETED', completedAt: '2026-09-05T10:00:00.000Z' },
  ]);
});

test('technical pagination truncation fails explicitly and never returns PARTIAL', async () => {
  let countReads = 0;
  const source: CheckinPageSource = {
    async readExactCount() {
      countReads += 1;
      return 3;
    },
    async readPage() {
      return [
        { id: 'c1', status: 'COMPLETED', completed_at: '2026-09-02T10:00:00.000Z' },
        { id: 'c2', status: 'COMPLETED', completed_at: '2026-09-03T10:00:00.000Z' },
      ];
    },
  };
  await assert.rejects(
    () => readCompletedCheckinsExhaustively(source, period, { pageSize: 3 }),
    (error: unknown) => error instanceof CheckinSourceReadError && error.code === 'SOURCE_TRUNCATED_OR_CHANGED',
  );
  assert.equal(countReads, 1);
});

test('population drift during exhaustive read fails explicitly', async () => {
  let countReads = 0;
  const source: CheckinPageSource = {
    async readExactCount() {
      countReads += 1;
      return countReads === 1 ? 2 : 3;
    },
    async readPage() {
      return [
        { id: 'c1', status: 'COMPLETED', completed_at: '2026-09-02T10:00:00.000Z' },
        { id: 'c2', status: 'COMPLETED', completed_at: '2026-09-03T10:00:00.000Z' },
      ];
    },
  };
  await assert.rejects(
    () => readCompletedCheckinsExhaustively(source, period, { pageSize: 2 }),
    (error: unknown) => error instanceof CheckinSourceReadError && error.code === 'SOURCE_TRUNCATED_OR_CHANGED',
  );
  assert.equal(countReads, 2);
});

test('duplicate checkins.id during exhaustive source read fails explicitly', async () => {
  const source: CheckinPageSource = {
    async readExactCount() { return 2; },
    async readPage() {
      return [
        { id: 'same', status: 'COMPLETED', completed_at: '2026-09-02T10:00:00.000Z' },
        { id: 'same', status: 'COMPLETED', completed_at: '2026-09-03T10:00:00.000Z' },
      ];
    },
  };
  await assert.rejects(
    () => readCompletedCheckinsExhaustively(source, period, { pageSize: 2 }),
    (error: unknown) => error instanceof CheckinSourceReadError && error.code === 'DUPLICATE_OBSERVATION_ID',
  );
});

test('Metric Platform returns CHECKIN_COMPLETED_COUNT v1 TOTAL with exact contributors and build identity', async () => {
  const result = await evaluateMetric({
    metricId: 'CHECKIN_COMPLETED_COUNT',
    metricVersion: 1,
    period,
    engineBuildSha: 'build-sha-123',
    calculatedAt: '2026-10-01T12:00:00.000Z',
    evaluationId: 'eval-checkin-1',
  }, {
    checkin: sourceAdapter([
      { id: 'c1', status: 'COMPLETED', completedAt: '2026-09-02T10:00:00.000Z' },
      { id: 'c2', status: 'COMPLETED', completedAt: '2026-09-03T10:00:00.000Z' },
    ]),
  });

  const contract = getMetricContract('CHECKIN_COMPLETED_COUNT', 1);
  assert.ok(contract);
  assert.equal(result.metricId, 'CHECKIN_COMPLETED_COUNT');
  assert.equal(result.metricVersion, 1);
  assert.equal(result.definitionFingerprint, definitionFingerprint(contract));
  assert.equal(result.engineBuildSha, 'build-sha-123');
  assert.equal(result.value, 2);
  assert.equal(result.statistics.n, 2);
  assert.equal(result.quality.maturity, 'VERIFIED');
  assert.equal(result.quality.coverage, 1);
  assert.equal(result.evaluation.asOf, null);
  assert.deepEqual(result.scope.dimensions, []);
  assert.deepEqual(result.evaluation.contributors.map((contributor) => contributor.sourceRecordId), ['c1', 'c2']);
});

test('verified empty Check-in population returns zero count and null coverage', async () => {
  const result = await evaluateMetric({
    metricId: 'CHECKIN_COMPLETED_COUNT', metricVersion: 1, period,
    engineBuildSha: 'build-sha-empty', calculatedAt: '2026-10-01T12:00:00.000Z', evaluationId: 'eval-empty',
  }, { checkin: sourceAdapter([]) });

  assert.equal(result.value, 0);
  assert.equal(result.statistics.n, 0);
  assert.equal(result.quality.maturity, 'VERIFIED');
  assert.equal(result.quality.coverage, null);
  assert.equal(result.quality.coverageBasisN, 0);
});
