import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync('app/api/garage/overview/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-overview-panel.tsx', 'utf8');
const page = readFileSync('app/garage/page.tsx', 'utf8');

test('Garage overview keeps one vehicle identity with multiple simultaneous operational flags', () => {
  assert.match(api, /type GarageFlag = 'UTVECKLA' \| 'AVVECKLA' \| 'HJULSKIFTE' \| 'STILLESTAND'/);
  assert.match(api, /flags: Set<GarageFlag>/);
  assert.match(api, /vehicle\.flags\.add\('UTVECKLA'\)/);
  assert.match(api, /vehicle\.flags\.add\('AVVECKLA'\)/);
  assert.match(api, /vehicle\.flags\.add\('HJULSKIFTE'\)/);
  assert.match(api, /vehicle\.flags\.add\('STILLESTAND'\)/);
  assert.doesNotMatch(api, /primary.*queue/i);
});

test('Garage overview reads only existing operational truth sources and excludes closed or voided work', () => {
  assert.match(api, /from\('garage_items'\)/);
  assert.match(api, /is\('voided_at', null\)/);
  assert.match(api, /from\('garage_wheel_changes'\)/);
  assert.match(api, /neq\('status', 'KLAR'\)/);
  assert.match(api, /from\('vehicle_journey_periods'\)/);
  assert.match(api, /eq\('period_type', 'DOWNTIME'\)/);
  assert.match(api, /is\('ended_at', null\)/);
  assert.doesNotMatch(api, /insert\(/);
  assert.doesNotMatch(api, /update\(/);
  assert.doesNotMatch(api, /delete\(/);
});

test('Garage overview exposes filter views over the same vehicle reality', () => {
  for (const label of ['Utveckla', 'Avveckla', 'Hjulskifte', 'Stillestånd', 'Flera behov']) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /En bil · flera samtidiga behov/);
  assert.match(panel, /En bil kan därför finnas i flera arbetsvyer samtidigt/);
  assert.match(panel, /active_need_count > 1/);
  assert.match(page, /GarageOverviewPanel/);
  assert.match(page, /00 \/ OPERATIV ÖVERSIKT/);
});
