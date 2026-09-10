import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const routeSource = fs.readFileSync(path.join(root, 'app/api/analytics/layer1-period-duration/route.ts'), 'utf8');
const reportSource = fs.readFileSync(path.join(root, 'app/rapport/layer1-period-duration-report.tsx'), 'utf8');
const rapportPageSource = fs.readFileSync(path.join(root, 'app/rapport/page.tsx'), 'utf8');
const towerSource = fs.readFileSync(path.join(root, 'app/tower/metrics/metrics-client.tsx'), 'utf8');
const operatorMetricSource = fs.readFileSync(path.join(root, 'app/api/operator-metrics/route.ts'), 'utf8');
const migrationSource = fs.readFileSync(path.join(root, 'migrations/20260910090000_reporting_layer1_period_read_contract.sql'), 'utf8');
const platformServiceSource = fs.readFileSync(path.join(root, 'lib/analytics/platform-service.ts'), 'utf8');

test('RPT-06 endpoint is fixed-purpose Layer 1 v1 and uses caller-token source adapter', () => {
  assert.match(routeSource, /authorizeAnalyticsServerRequest\(request\)/);
  assert.match(routeSource, /input\.metricId !== 'LAYER1_PERIOD_DURATION_HOURS'/);
  assert.match(routeSource, /input\.metricVersion !== 1/);
  assert.match(routeSource, /createSupabaseLayer1PeriodSourceAdapter\(access\.sourceClient\)/);
  assert.match(routeSource, /signMetricEvaluation\(access\.principal, result, access\.evaluationSecret\)/);
  assert.doesNotMatch(routeSource, /service.?role/i);
  assert.doesNotMatch(routeSource, /\.insert\s*\(|\.update\s*\(|\.upsert\s*\(|\.delete\s*\(/);
});

test('RPT-06 platform service requires only the source for the selected metric path', () => {
  assert.match(platformServiceSource, /checkin\?: CheckinSourceAdapter/);
  assert.match(platformServiceSource, /layer1Period\?: Layer1PeriodSourceAdapter/);
  assert.match(platformServiceSource, /if \(!sources\.checkin\) throw new Error/);
  assert.match(platformServiceSource, /if \(!sources\.layer1Period\) throw new Error/);
});

test('RPT-06 report consumes signed METRIC_RESULT_V1 without local KPI math', () => {
  assert.match(reportSource, /fetch\('\/api\/analytics\/layer1-period-duration'/);
  assert.match(reportSource, /metricId:\s*'LAYER1_PERIOD_DURATION_HOURS'/);
  assert.match(reportSource, /metricVersion:\s*1/);
  assert.match(reportSource, /evaluation\.contract !== 'SIGNED_METRIC_EVALUATION_V1'/);
  assert.match(reportSource, /result\.resultContract !== 'METRIC_RESULT_V1'/);
  assert.match(reportSource, /result\.value !== result\.statistics\.mean/);
  assert.match(reportSource, /formatHours\(result\?\.value/);
  assert.match(reportSource, /result\?\.statistics\.median/);
  assert.match(reportSource, /result\?\.statistics\.p90/);
  assert.match(reportSource, /result\?\.statistics\.n/);
  assert.match(reportSource, /result\?\.quality\.maturity/);
  assert.match(reportSource, /result\?\.quality\.coverage/);
  for (const forbidden of [/Math\.round/, /reduce\s*\(/, /mean\s*=/, /median\s*=/, /p90\s*=/, /payload\.durationHours/]) {
    assert.equal(forbidden.test(reportSource), false, `Report must not implement metric math: ${forbidden}`);
  }
});

test('RPT-06 report uses approved completed DAY/MONTH Stockholm period contract and TOTAL only', () => {
  assert.match(reportSource, /resolveCheckinReportPeriod/);
  assert.match(reportSource, /isCompletedCheckinReportPeriod/);
  assert.match(reportSource, /option value="day">DAG<\/option>/);
  assert.match(reportSource, /option value="month">MÅNAD<\/option>/);
  assert.match(reportSource, /result\.scope\.timezone !== 'Europe\/Stockholm'/);
  assert.match(reportSource, /result\.scope\.intervalSemantics !== '\[start,end\)'/);
  assert.match(reportSource, /result\.scope\.dimensions\.length !== 0/);
  assert.doesNotMatch(reportSource, /station|region|regnr|period_type.*filter|source_system.*filter/i);
});

test('RPT-06 is mounted on /rapport while RPT-04 Check-in and SKADEJOURNAL remain present', () => {
  assert.match(rapportPageSource, /Layer1PeriodDurationReport/);
  assert.match(rapportPageSource, /CHECK-IN – VOLYM/);
  assert.match(rapportPageSource, /SKADEJOURNAL/);
  assert.match(rapportPageSource, /Platsfilter – endast skadejournal/);
  assert.match(rapportPageSource, /fetch\('\/api\/analytics\/checkin-completed-count'/);
  assert.match(rapportPageSource, /'\/api\/report-damages'/);
});

test('RPT-06 migration grants only locked Layer 1 source columns to authenticated and no anon/write access', () => {
  const allowed = [
    'period_id', 'period_type', 'started_at', 'ended_at', 'reason_code',
    'source_system', 'source_entity', 'source_record_id', 'source_event_id',
  ];
  assert.match(migrationSource, /to authenticated/);
  assert.match(migrationSource, /private\.is_app_user\(\)/);
  assert.match(migrationSource, /for select/);
  for (const column of allowed) assert.match(migrationSource, new RegExp(`\\b${column}\\b`));
  const grantBlock = migrationSource.slice(migrationSource.indexOf('grant select ('), migrationSource.indexOf(') on table public.vehicle_journey_periods to authenticated;') + 58);
  for (const forbidden of ['regnr', 'reason_text', 'metadata', 'created_by', 'created_at', 'updated_at']) {
    assert.doesNotMatch(grantBlock, new RegExp(`\\b${forbidden}\\b`));
  }
  assert.doesNotMatch(migrationSource, /grant\s+(?:insert|update|delete|all).*authenticated/i);
  assert.doesNotMatch(migrationSource, /grant\s+select.*\bto\s+anon/i);
  assert.doesNotMatch(migrationSource, /vehicle_journey_activity_periods/i);
  assert.doesNotMatch(migrationSource, /security\s+definer/i);
});

test('RPT-06 Tower cleanup changes visible semantics only, not operator metric formula', () => {
  assert.match(towerSource, /title="Perioder startade i driftfönstret"/);
  assert.match(towerSource, /urval via started_at/);
  assert.match(towerSource, /ej officiell Layer 1 completion-cohort metric/);
  assert.doesNotMatch(towerSource, /title="Stängda perioder"/);
  assert.match(operatorMetricSource, /\.gte\('started_at', since\)/);
  assert.match(operatorMetricSource, /closedPeriodAvgHours:\s*rounded\(average\(closedPeriodHours\)\)/);
  assert.match(operatorMetricSource, /closedPeriodMedianHours:\s*rounded\(median\(closedPeriodHours\)\)/);
});
