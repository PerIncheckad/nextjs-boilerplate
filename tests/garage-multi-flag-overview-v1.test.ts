import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const garagePage = readFileSync('app/garage/page.tsx', 'utf8');
const garageCoreApi = readFileSync('app/api/garage/core/route.ts', 'utf8');
const garageCorePanel = readFileSync('app/garage/garage-core-panel.tsx', 'utf8');
const wheelApi = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const towerReadModel = readFileSync('app/api/tower/read-model/route.ts', 'utf8');

const removedOverviewArtifacts = [
  'app/api/garage/overview/route.ts',
  'app/garage/garage-overview-panel.tsx',
  'app/garage/garage-overview.module.css',
];

test('legacy Garage Overview artifacts stay removed and Garage Core remains primary', () => {
  for (const path of removedOverviewArtifacts) {
    assert.equal(existsSync(path), false, `${path} must stay removed`);
  }
  assert.doesNotMatch(garagePage, /GarageOverviewPanel/);
  assert.doesNotMatch(garagePage, /00 \/ OPERATIV ÖVERSIKT/);
  assert.match(garagePage, /GarageCorePanel/);
  assert.match(garagePage, /00 \/ GARAGE CORE/);
});

test('Garage Core owns Garage staging, handoff state and provenance without cross-domain overview reads', () => {
  assert.match(garageCoreApi, /from\('garage_items'\)/);
  assert.match(garageCoreApi, /handed_off_nybil_id/);
  assert.match(garageCoreApi, /source_journey_period_id/);
  assert.match(garageCoreApi, /source_journey_event_id/);
  assert.match(garageCoreApi, /source_legacy_entry_id/);
  assert.match(garageCorePanel, /SOURCE \/ PROVENANCE/);
  assert.doesNotMatch(garageCoreApi, /garage_wheel_changes/);
  assert.doesNotMatch(garageCoreApi, /period_type.*DOWNTIME/);
  assert.doesNotMatch(garageCoreApi, /salu_flags/);
  assert.doesNotMatch(garageCoreApi, /insert\(/);
  assert.doesNotMatch(garageCoreApi, /update\(/);
  assert.doesNotMatch(garageCoreApi, /delete\(/);
  assert.doesNotMatch(garageCoreApi, /rpc\(/);
});

test('cross-domain reads remain with their canonical owners after Overview removal', () => {
  assert.match(wheelApi, /from\('garage_wheel_changes'\)/);
  assert.match(towerReadModel, /from\('vehicle_journey_periods'\)/);
  assert.match(towerReadModel, /state === 'DOWNTIME'/);
  assert.match(towerReadModel, /from\('garage_wheel_changes'\)/);
});
