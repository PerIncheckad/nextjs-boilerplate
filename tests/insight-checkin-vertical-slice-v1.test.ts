import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { resolveInsightCheckinPeriods, InsightPeriodError } from '../lib/insight/checkin-period';
import { INSIGHT_V1_CAPABILITIES, resolveExactActiveEmployee } from '../lib/insight/server-access';

const nowSep17 = new Date('2026-09-17T10:00:00.000Z');

function expectPeriodReject(startDate: string, endDateExclusive: string, now = nowSep17) {
  assert.throws(
    () => resolveInsightCheckinPeriods(startDate, endDateExclusive, now),
    (error: unknown) => error instanceof InsightPeriodError,
  );
}

test('INSIGHT V1 accepts 1 and 31 completed Stockholm calendar days', () => {
  assert.equal(resolveInsightCheckinPeriods('2026-09-16', '2026-09-17', nowSep17).selectedLocal.localCalendarDays, 1);
  assert.equal(resolveInsightCheckinPeriods('2026-08-17', '2026-09-17', nowSep17).selectedLocal.localCalendarDays, 31);
});

test('INSIGHT V1 rejects 32 days, invalid dates, reversed and zero-length periods', () => {
  expectPeriodReject('2026-08-16', '2026-09-17');
  expectPeriodReject('2026-02-31', '2026-03-01');
  expectPeriodReject('2026-09-17', '2026-09-17');
  expectPeriodReject('2026-09-18', '2026-09-17');
});

test('strict calendar parsing accepts a real leap day and rejects a false leap day', () => {
  const leapNow = new Date('2028-03-02T10:00:00.000Z');
  const period = resolveInsightCheckinPeriods('2028-02-29', '2028-03-01', leapNow);
  assert.equal(period.selectedLocal.localCalendarDays, 1);
  expectPeriodReject('2027-02-29', '2027-03-01', new Date('2027-03-02T10:00:00.000Z'));
});

test('endDateExclusive = current Stockholm date is allowed but including current day is rejected', () => {
  const completed = resolveInsightCheckinPeriods('2026-09-10', '2026-09-17', nowSep17);
  assert.equal(completed.selectedLocal.endDateExclusive, '2026-09-17');
  expectPeriodReject('2026-09-11', '2026-09-18');
});

test('comparison is server-derived, adjacent, non-overlapping and equal in local calendar days', () => {
  const periods = resolveInsightCheckinPeriods('2026-09-01', '2026-09-08', nowSep17);
  assert.deepEqual(periods.selectedLocal, {
    startDate: '2026-09-01', endDateExclusive: '2026-09-08', localCalendarDays: 7,
  });
  assert.deepEqual(periods.comparisonLocal, {
    startDate: '2026-08-25', endDateExclusive: '2026-09-01', localCalendarDays: 7,
  });
});

test('DST does not change local calendar-day count', () => {
  const periods = resolveInsightCheckinPeriods(
    '2026-03-25', '2026-04-01', new Date('2026-04-02T10:00:00.000Z'),
  );
  assert.equal(periods.selectedLocal.localCalendarDays, 7);
  const elapsedHours = (Date.parse(periods.selectedCanonical.end) - Date.parse(periods.selectedCanonical.start)) / 3_600_000;
  assert.equal(elapsedHours, 167);
});

test('employee identity resolution is exact, active and fail-closed on ambiguity', () => {
  const good = resolveExactActiveEmployee([
    { id: 'employee-1', email: 'user@example.com', is_active: true, active: true },
  ], 'user@example.com');
  assert.deepEqual(good, { ok: true, employeeId: 'employee-1' });

  assert.deepEqual(resolveExactActiveEmployee([], 'user@example.com'), { ok: false });
  assert.deepEqual(resolveExactActiveEmployee([
    { id: 'employee-1', email: 'user@example.com', is_active: true, active: true },
    { id: 'employee-2', email: 'user@example.com', is_active: true, active: true },
  ], 'user@example.com'), { ok: false });
  assert.deepEqual(resolveExactActiveEmployee([
    { id: 'employee-1', email: 'user@example.com', is_active: false, active: true },
  ], 'user@example.com'), { ok: false });
  assert.deepEqual(resolveExactActiveEmployee([
    { id: 'employee-1', email: 'user@example.com', is_active: true, active: false },
  ], 'user@example.com'), { ok: false });
});

test('INSIGHT V1 capability profile is server-defined and excludes EXPORT', () => {
  assert.deepEqual([...INSIGHT_V1_CAPABILITIES].sort(), ['AGGREGATE', 'DRILL_DOWN', 'SOURCE_CONTRIBUTOR'].sort());
  assert.equal(INSIGHT_V1_CAPABILITIES.has('EXPORT'), false);
});

test('fixed Check-in endpoint accepts no caller-controlled analytics authority or comparison period', () => {
  const route = fs.readFileSync('app/api/insight/checkin-completed-count/route.ts', 'utf8');
  assert.match(route, /ALLOWED_REQUEST_KEYS = new Set\(\['startDate', 'endDateExclusive'\]\)/);
  assert.match(route, /metricId: 'CHECKIN_COMPLETED_COUNT'/);
  assert.match(route, /metricVersion: 1/);
  assert.match(route, /resolveInsightCheckinPeriods/);
  assert.match(route, /compareMetricResults\(selected, comparison\)/);
  assert.match(route, /result\.value !== included/);
  assert.doesNotMatch(route, /input\.metricId|input\.metricVersion|input\.consumer|input\.capability|input\.scope/);
});

test('INSIGHT source population uses the authenticated analytics source client, not an admin source client', () => {
  const route = fs.readFileSync('app/api/insight/checkin-completed-count/route.ts', 'utf8');
  const traceback = fs.readFileSync('app/api/insight/checkin-completed-count/traceback/route.ts', 'utf8');
  assert.match(route, /createSupabaseCheckinSourceAdapter\(gate\.access\.sourceClient\)/);
  assert.match(traceback, /createSupabaseCheckinSourceAdapter\(gate\.access\.sourceClient\)/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|createClient\(/);
  assert.doesNotMatch(traceback, /SUPABASE_SERVICE_ROLE_KEY|createClient\(/);
});

test('traceback is fixed to signed CHECKIN_COMPLETED_COUNT@1 and exact contributor binding', () => {
  const traceback = fs.readFileSync('app/api/insight/checkin-completed-count/traceback/route.ts', 'utf8');
  assert.match(traceback, /verifyMetricEvaluation/);
  assert.match(traceback, /tracebackCheckinContributor/);
  assert.match(traceback, /result\.metricId !== 'CHECKIN_COMPLETED_COUNT'/);
  assert.match(traceback, /result\.metricVersion !== 1/);
  assert.match(traceback, /authorizeInsightRequest\(request, 'SOURCE_CONTRIBUTOR'\)/);
});

test('migration defines ACCESS_INSIGHT only and does not seed employee mandates', () => {
  const migration = fs.readFileSync('migrations/20260917015000_add_access_insight_capability_v1.sql', 'utf8');
  assert.match(migration, /'ACCESS_INSIGHT'/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.employee_mandates/i);
  assert.doesNotMatch(migration, /create\s+table/i);
});

test('first page remains outside shared navigation and does not add forbidden V1 analysis', () => {
  const page = fs.readFileSync('app/insight/flode/page.tsx', 'utf8');
  assert.match(page, /CHECKIN_COMPLETED_COUNT@1/);
  assert.match(page, /contributor\.sourceBusinessTimestamp/);
  assert.doesNotMatch(page, /station breakdown|city breakdown|forecast|damage rate/i);
});

test('transactional PostgreSQL ACCESS_INSIGHT acceptance passes in CI', { skip: process.env.CI !== 'true' }, () => {
  const result = spawnSync('bash', ['scripts/test-insight-access-postgres.sh'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      PGHOST: process.env.PGHOST ?? '127.0.0.1',
      PGPORT: process.env.PGPORT ?? '5432',
      PGUSER: process.env.PGUSER ?? 'postgres',
      PGPASSWORD: process.env.PGPASSWORD ?? 'postgres',
      PGDATABASE: process.env.PGDATABASE ?? 'postgres',
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS \(transaction rolled back\)/);
});
