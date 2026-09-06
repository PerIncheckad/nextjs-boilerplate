import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync('app/api/garage/overview/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-overview-panel.tsx', 'utf8');
const page = readFileSync('app/garage/page.tsx', 'utf8');

test('legacy Garage overview API remains intact for later cleanup', () => {
  assert.match(api, /type GarageFlag = 'UTVECKLA' \| 'AVVECKLA' \| 'HJULSKIFTE' \| 'STILLESTAND'/);
  assert.match(api, /from\('garage_items'\)/);
  assert.match(api, /from\('garage_wheel_changes'\)/);
  assert.match(api, /eq\('period_type', 'DOWNTIME'\)/);
  assert.doesNotMatch(api, /insert\(/);
  assert.doesNotMatch(api, /update\(/);
  assert.doesNotMatch(api, /delete\(/);
});

test('legacy multi-flag panel is no longer mounted as Garage primary view', () => {
  assert.match(panel, /En bil · flera samtidiga behov/);
  assert.doesNotMatch(page, /GarageOverviewPanel/);
  assert.doesNotMatch(page, /00 \/ OPERATIV ÖVERSIKT/);
  assert.match(page, /GarageCorePanel/);
  assert.match(page, /00 \/ GARAGE CORE/);
});
