import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const routePath = path.join(process.cwd(), 'app/api/operator-metrics/route.ts');
const routeSource = fs.readFileSync(routePath, 'utf8');

test('operator metrics requires authenticated API access', () => {
  assert.match(routeSource, /verifyApiUser\(request\)/);
});

test('operator metrics stays read-only', () => {
  assert.doesNotMatch(routeSource, /\.insert\(/);
  assert.doesNotMatch(routeSource, /\.update\(/);
  assert.doesNotMatch(routeSource, /\.delete\(/);
  assert.doesNotMatch(routeSource, /\.rpc\(/);
});

test('operator metrics reads only existing operational evidence projections', () => {
  assert.match(routeSource, /vehicle_journey_periods/);
  assert.match(routeSource, /handoffs/);
  assert.match(routeSource, /checkpoint_actions/);
  assert.match(routeSource, /vehicle_checkpoints/);
});

test('operator metrics exposes sample sufficiency instead of asserting KPI truth from sparse data', () => {
  assert.match(routeSource, /minimumReliableSample: 10/);
  assert.match(routeSource, /verifiedHandoffDurations\.length >= 10/);
  assert.match(routeSource, /verifiedActionDurations\.length >= 10/);
});
