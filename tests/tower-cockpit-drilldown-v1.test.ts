import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reconcileTowerPopulation } from '../lib/tower-population-reconciliation';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function buildPopulation() {
  return reconcileTowerPopulation({
    activeMembershipRows: [
      { identity_id: 'id-a' },
      { identity_id: 'id-b' },
      { identity_id: 'id-c' },
      { identity_id: 'id-d' },
    ],
    regnrAliasRows: [
      { identity_id: 'id-a', alias_value: 'AAA111' },
      { identity_id: 'id-b', alias_value: 'BBB222' },
      { identity_id: 'id-c', alias_value: 'CCC333' },
      { identity_id: 'id-d', alias_value: 'DDD444' },
    ],
    openPrimaryPeriods: [
      { regnr: 'AAA111', period_type: 'AVAILABLE', started_at: '2026-09-17T00:00:00Z', source_system: 'STATUS', source_entity: 'vehicle_journey_periods' },
      { regnr: 'BBB222', period_type: 'DOWNTIME', started_at: '2026-09-17T00:01:00Z', reason_code: 'SERVICE', source_system: 'CHECKIN', source_entity: 'vehicle_journey_periods' },
      { regnr: 'ZZZ999', period_type: 'AVAILABLE', started_at: '2026-09-17T00:02:00Z', source_system: 'STATUS', source_entity: 'vehicle_journey_periods' },
    ],
    openActivities: [
      { regnr: 'BBB222', activity_type: 'WORKSHOP', started_at: '2026-09-17T00:03:00Z' },
      { regnr: 'ZZZ999', activity_type: 'WORKSHOP', started_at: '2026-09-17T00:04:00Z' },
    ],
  });
}

test('drilldown lists are emitted by the same reconciliation builder as Tower counts', () => {
  const result = buildPopulation();
  assert.equal(result.populations.active.length, result.active);
  assert.equal(result.populations.positioned.length, result.positionedActive);
  assert.equal(result.populations.missingOperationalPosition.length, result.missingOperationalPosition);
  assert.equal(result.populations.primaryStates.AVAILABLE.length, result.primaryStates.AVAILABLE);
  assert.equal(result.populations.primaryStates.DOWNTIME.length, result.primaryStates.DOWNTIME);
  assert.equal(result.populations.externalLayer1.length, result.reconciliation.outsideActivePrimaryStateVehicles);

  assert.deepEqual(result.populations.primaryStates.AVAILABLE.map((row) => row.identityId), ['id-a']);
  assert.deepEqual(result.populations.primaryStates.DOWNTIME.map((row) => row.identityId), ['id-b']);
  assert.deepEqual(result.populations.missingOperationalPosition.map((row) => row.identityId), ['id-c', 'id-d']);
  assert.equal(result.populations.missingOperationalPosition.every((row) => row.primaryState === null), true);
  assert.deepEqual(result.populations.externalLayer1.map((row) => row.regnr), ['ZZZ999']);
  assert.equal(result.populations.primaryStates.DOWNTIME[0]?.activityType, 'WORKSHOP');
});

test('ambiguous alias, missing alias and duplicate open Layer 1 remain fail-closed', () => {
  const result = reconcileTowerPopulation({
    activeMembershipRows: [{ identity_id: 'id-a' }, { identity_id: 'id-b' }, { identity_id: 'id-c' }],
    regnrAliasRows: [
      { identity_id: 'id-a', alias_value: 'AAA111' },
      { identity_id: 'id-a', alias_value: 'AAA112' },
      { identity_id: 'id-b', alias_value: 'BBB222' },
    ],
    openPrimaryPeriods: [
      { regnr: 'AAA111', period_type: 'AVAILABLE' },
      { regnr: 'BBB222', period_type: 'AVAILABLE' },
      { regnr: 'BBB222', period_type: 'DOWNTIME' },
    ],
    openActivities: [],
  });

  assert.equal(result.active, 3);
  assert.equal(result.positionedActive, 0);
  assert.equal(result.missingOperationalPosition, 3);
  assert.equal(result.primaryStates.AVAILABLE, 0);
  assert.equal(result.primaryStates.DOWNTIME, 0);
  assert.equal(result.reconciliation.activeIdentityAliasIssues, 2);
  assert.equal(result.reconciliation.ambiguousActiveLayer1Vehicles, 1);
  assert.equal(result.reconciliation.duplicateOpenLayer1Vehicles, 1);
  assert.equal(result.populations.missingOperationalPosition.every((row) => row.primaryState === null), true);
});

test('Tower route binds Garage and SALU counts directly to the exposed drilldown arrays', () => {
  const route = read('app/api/tower/read-model/route.ts');
  assert.match(route, /owned:\s*garageDrilldown\.length/);
  assert.match(route, /open:\s*saluDrilldown\.length/);
  assert.match(route, /drilldown:\s*garageDrilldown/);
  assert.match(route, /drilldown:\s*saluDrilldown/);
  assert.match(route, /drilldown:\s*fleetMembershipVerified \? population\.populations/);
  assert.doesNotMatch(route, /missingOperationalPosition[^\n]*UNKNOWN/);
});

test('Tower cockpit exposes read-only drilldown and keeps AVVECKLA unavailable', () => {
  const ui = read('app/tower/tower-invisto-v2.tsx');
  assert.match(ui, /Saknar verifierad operativ position/);
  assert.match(ui, /Layer 1 utanför AKTIVA/);
  assert.match(ui, /Objektlistan kommer från samma population som siffran/);
  assert.match(ui, /Drilldown är unavailable tills separat canonical AVVECKLA read-contract finns/);
  assert.match(ui, /Ingen alternativ hyrbilslista infereras/);
  assert.doesNotMatch(ui, /authenticatedApiFetch\([^)]*method:\s*['\"](?:POST|PUT|PATCH|DELETE)/);
});
