import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  InsightCheckinPeriodError,
  resolveInsightCheckinPeriods,
} from '../lib/insight/checkin-period';

const fixedNow = new Date('2026-09-17T00:12:00.000Z'); // 02:12 Europe/Stockholm

function expectPeriodError(
  input: { startDate: string; endDateExclusive: string },
  code: InsightCheckinPeriodError['code'],
  now = fixedNow,
) {
  assert.throws(
    () => resolveInsightCheckinPeriods(input, now),
    (error: unknown) => error instanceof InsightCheckinPeriodError && error.code === code,
  );
}

test('1 local calendar day passes and comparison is immediately preceding day', () => {
  const result = resolveInsightCheckinPeriods({ startDate: '2026-09-16', endDateExclusive: '2026-09-17' }, fixedNow);
  assert.equal(result.selected.local.localDayCount, 1);
  assert.deepEqual(result.comparison.local, {
    startDate: '2026-09-15',
    endDateExclusive: '2026-09-16',
    localDayCount: 1,
  });
});

test('31 local calendar days pass and 32 are rejected', () => {
  assert.equal(
    resolveInsightCheckinPeriods({ startDate: '2026-08-17', endDateExclusive: '2026-09-17' }, fixedNow).selected.local.localDayCount,
    31,
  );
  expectPeriodError({ startDate: '2026-08-16', endDateExclusive: '2026-09-17' }, 'PERIOD_TOO_LONG');
});

test('invalid calendar and leap dates fail closed', () => {
  expectPeriodError({ startDate: '2026-02-29', endDateExclusive: '2026-03-01' }, 'INVALID_DATE');
  expectPeriodError({ startDate: '2026-02-31', endDateExclusive: '2026-03-01' }, 'INVALID_DATE');
});

test('endDateExclusive equal Stockholm today passes but including current day is rejected', () => {
  assert.doesNotThrow(() => resolveInsightCheckinPeriods({ startDate: '2026-09-10', endDateExclusive: '2026-09-17' }, fixedNow));
  expectPeriodError({ startDate: '2026-09-11', endDateExclusive: '2026-09-18' }, 'PERIOD_NOT_COMPLETED');
});

test('seven local days remain seven across Stockholm DST transition', () => {
  const result = resolveInsightCheckinPeriods(
    { startDate: '2026-10-22', endDateExclusive: '2026-10-29' },
    new Date('2026-11-01T12:00:00.000Z'),
  );
  assert.equal(result.selected.local.localDayCount, 7);
  const elapsedHours = (Date.parse(result.selected.canonical.end) - Date.parse(result.selected.canonical.start)) / 3_600_000;
  assert.equal(elapsedHours, 169);
});

test('server derives comparison; caller-controlled routing, scope and comparison fields are rejected by contract', () => {
  const route = fs.readFileSync('app/api/insight/checkin-completed-count/route.ts', 'utf8');
  assert.match(route, /allowedKeys = new Set\(\['startDate', 'endDateExclusive'\]\)/);
  assert.match(route, /resolveInsightCheckinPeriods/);
  assert.doesNotMatch(route, /input\.comparison/);
  assert.match(route, /metricId: 'CHECKIN_COMPLETED_COUNT'/);
  assert.match(route, /metricVersion: 1/);
});

test('publication invariant requires VERIFIED and exact INCLUDED contributor count', () => {
  const route = fs.readFileSync('app/api/insight/checkin-completed-count/route.ts', 'utf8');
  assert.match(route, /quality\.maturity !== 'VERIFIED'/);
  assert.match(route, /item\.classification === 'INCLUDED'/);
  assert.match(route, /result\.value !== included/);
});

test('INSIGHT access is server-owned, GLOBAL-only and never a Check-in service-role source', () => {
  const access = fs.readFileSync('lib/insight/server-access.ts', 'utf8');
  const route = fs.readFileSync('app/api/insight/checkin-completed-count/route.ts', 'utf8');
  assert.match(access, /p_capability_code: 'ACCESS_INSIGHT'/);
  assert.match(access, /p_scope_type: 'GLOBAL'/);
  assert.match(access, /consumers: new Set\(\['INSIGHT'\]\)/);
  assert.match(access, /'AGGREGATE'/);
  assert.match(access, /'DRILL_DOWN'/);
  assert.match(access, /'SOURCE_CONTRIBUTOR'/);
  assert.doesNotMatch(access, /'EXPORT'/);
  assert.match(route, /createSupabaseCheckinSourceAdapter\(access\.sourceClient\)/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|createClient\(/);
});

test('duplicate normalized employee identity fails closed in server access implementation', () => {
  const access = fs.readFileSync('lib/insight/server-access.ts', 'utf8');
  assert.match(access, /row\.email\.trim\(\)\.toLowerCase\(\) === email/);
  assert.match(access, /matches\.length !== 1/);
});

test('traceback requires signed evaluation and fixed Check-in metric identity', () => {
  const route = fs.readFileSync('app/api/insight/checkin-completed-count/traceback/route.ts', 'utf8');
  assert.match(route, /verifyMetricEvaluation/);
  assert.match(route, /tracebackCheckinContributor/);
  assert.match(route, /CHECKIN_COMPLETED_COUNT/);
  assert.match(route, /createSupabaseCheckinSourceAdapter\(access\.sourceClient\)/);
});

test('migration defines ACCESS_INSIGHT and never seeds employee mandates', () => {
  const migration = fs.readFileSync('migrations/20260917001500_add_access_insight_capability_v1.sql', 'utf8');
  assert.match(migration, /'ACCESS_INSIGHT'/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.employee_mandates/i);
});

test('shared Analytics consumer change is additive and protected Analytics truth paths stay outside INSIGHT implementation', () => {
  const contracts = fs.readFileSync('lib/analytics/contracts.ts', 'utf8');
  assert.match(contracts, /'REPORTING' \| 'TOWER' \| 'AI' \| 'INSIGHT'/);
  const insightRoute = fs.readFileSync('app/api/insight/checkin-completed-count/route.ts', 'utf8');
  assert.match(insightRoute, /evaluateMetric/);
  assert.match(insightRoute, /compareMetricResults/);
  assert.doesNotMatch(insightRoute, /from\(['"]checkins['"]\)/);
});

test('PostgreSQL INSIGHT authorization acceptance runs transactionally in CI', { skip: process.env.CI !== 'true' }, () => {
  execFileSync('bash', ['scripts/test-insight-access-postgres.sh'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PGHOST: process.env.PGHOST ?? '127.0.0.1',
      PGPORT: process.env.PGPORT ?? '5432',
      PGUSER: process.env.PGUSER ?? 'postgres',
      PGPASSWORD: process.env.PGPASSWORD ?? 'postgres',
      PGDATABASE: process.env.PGDATABASE ?? 'postgres',
    },
  });
});
