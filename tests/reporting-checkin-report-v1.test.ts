import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  latestCompletedDayInput,
  latestCompletedMonthInput,
  resolveCheckinReportPeriod,
} from '../lib/reporting/checkin-report-period';

const reportPagePath = path.join(process.cwd(), 'app', 'rapport', 'page.tsx');
const periodHelperPath = path.join(process.cwd(), 'lib', 'reporting', 'checkin-report-period.ts');
const reportSource = fs.readFileSync(reportPagePath, 'utf8');
const periodSource = fs.readFileSync(periodHelperPath, 'utf8');

test('RPT-04 /rapport consumes the fixed Check-in metric endpoint and v1 contract', () => {
  assert.match(reportSource, /fetch\('\/api\/analytics\/checkin-completed-count'/);
  assert.match(reportSource, /metricId:\s*'CHECKIN_COMPLETED_COUNT'/);
  assert.match(reportSource, /metricVersion:\s*1/);
  assert.match(reportSource, /result\.resultContract\s*!==\s*'METRIC_RESULT_V1'/);
  assert.match(reportSource, /metricResult\?\.value/);
});

test('RPT-04 Check-in volume never derives its value from damage rows', () => {
  assert.equal(/totIncheckningar|allDamages\.length\s*[^;]*Check-in|allDamages\.filter[^;]*Check-in/.test(reportSource), false);
  assert.doesNotMatch(reportSource, /Totalt incheckningar \(all tid\)/);
  assert.doesNotMatch(reportSource, /Totalt skador \(all tid\)/);
  assert.doesNotMatch(reportSource, /Skadeprocent \(all tid\)/);
  assert.doesNotMatch(reportSource, /Senaste incheckning/);
});

test('RPT-04 period resolution delegates to canonical Stockholm day/month resolvers only', () => {
  assert.match(periodSource, /resolveStockholmDay/);
  assert.match(periodSource, /resolveStockholmMonth/);
  assert.match(periodSource, /return resolveStockholmDay\(/);
  assert.match(periodSource, /return resolveStockholmMonth\(/);
  assert.doesNotMatch(periodSource, /stockholmLocalToEpochMs|Date\.UTC\(|getTimezoneOffset/);
  assert.match(reportSource, /option value="day">DAG<\/option>/);
  assert.match(reportSource, /option value="month">MÅNAD<\/option>/);
  for (const forbidden of ['All tid', 'Rullande 7 dagar', 'Rullande 30 dagar', 'Rullande år', 'YTD (2025)', 'Oktober 2025']) {
    assert.equal(reportSource.includes(forbidden), false, `Legacy period option must be removed: ${forbidden}`);
  }
});

test('RPT-04 defaults resolve the latest actually completed Stockholm period', () => {
  assert.equal(latestCompletedDayInput(new Date('2026-09-09T21:30:00Z')), '2026-09-08');
  assert.equal(latestCompletedDayInput(new Date('2026-09-09T22:30:00Z')), '2026-09-09');
  assert.equal(latestCompletedMonthInput(new Date('2026-08-31T21:30:00Z')), '2026-07');
  assert.equal(latestCompletedMonthInput(new Date('2026-08-31T22:30:00Z')), '2026-08');

  const day = resolveCheckinReportPeriod('day', '2026-09-08');
  assert.deepEqual(
    { start: day.start, end: day.end, timezone: day.timezone, intervalSemantics: day.intervalSemantics },
    {
      start: '2026-09-07T22:00:00.000Z',
      end: '2026-09-08T22:00:00.000Z',
      timezone: 'Europe/Stockholm',
      intervalSemantics: '[start,end)',
    },
  );
});

test('RPT-04 Check-in request is TOTAL and sends no dimension or location filters', () => {
  const requestBlock = reportSource.slice(
    reportSource.indexOf("fetch('/api/analytics/checkin-completed-count'"),
    reportSource.indexOf('const body = await response.json()', reportSource.indexOf("fetch('/api/analytics/checkin-completed-count'")),
  );
  assert.doesNotMatch(requestBlock, /station|city|region|plats|regnr|dimension|filter/i);
  assert.match(reportSource, /result\.scope\.dimensions\.length\s*!==\s*0/);
});

test('RPT-04 preserves damage journal and media as a separate concern', () => {
  assert.match(reportSource, /SKADEJOURNAL/);
  assert.match(reportSource, /'\/api\/report-damages'/);
  assert.match(reportSource, /\/api\/report-damages\?damageId=/);
  assert.match(reportSource, /MediaModal/);
  assert.match(reportSource, /Platsfilter – endast skadejournal/);
});

test('RPT-04 introduces neither browser Supabase source access nor source writes', () => {
  assert.doesNotMatch(reportSource, /\bsupabase\s*\.\s*(?:from|rpc)\s*\(/);
  for (const pattern of [/\.insert\s*\(/, /\.update\s*\(/, /\.upsert\s*\(/, /\.delete\s*\(/]) {
    assert.equal(pattern.test(reportSource), false);
    assert.equal(pattern.test(periodSource), false);
  }
});
