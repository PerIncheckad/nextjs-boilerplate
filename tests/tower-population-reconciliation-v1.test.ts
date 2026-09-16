import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTowerPopulation } from '../lib/tower-population-reconciliation';

const activeMembershipRows = [
  { identity_id: 'i1' },
  { identity_id: 'i2' },
  { identity_id: 'i3' },
  { identity_id: 'i4' },
];

const regnrAliasRows = [
  { identity_id: 'i1', alias_value: 'AAA111' },
  { identity_id: 'i2', alias_value: 'BBB222' },
  { identity_id: 'i3', alias_value: 'CCC333' },
  { identity_id: 'i4', alias_value: 'DDD444' },
];

test('Tower reconciles Layer 1 only inside canonical ACTIVE membership', () => {
  const result = reconcileTowerPopulation({
    activeMembershipRows,
    regnrAliasRows,
    openPrimaryPeriods: [
      { regnr: 'AAA111', period_type: 'AVAILABLE' },
      { regnr: 'BBB222', period_type: 'DOWNTIME' },
      { regnr: 'ZZZ999', period_type: 'AVAILABLE' },
    ],
    openActivities: [],
  });

  assert.equal(result.active, 4);
  assert.equal(result.positionedActive, 2);
  assert.equal(result.missingOperationalPosition, 2);
  assert.equal(result.primaryStates.AVAILABLE, 1);
  assert.equal(result.primaryStates.DOWNTIME, 1);
  assert.equal(result.reconciliation.outsideActivePrimaryStateVehicles, 1);
  assert.equal(result.reconciliation.outsideActivePrimaryStates.AVAILABLE, 1);
});

test('missing operational position is coverage and never fabricated as UNKNOWN', () => {
  const result = reconcileTowerPopulation({
    activeMembershipRows,
    regnrAliasRows,
    openPrimaryPeriods: [{ regnr: 'AAA111', period_type: 'AVAILABLE' }],
    openActivities: [],
  });

  assert.equal(result.active, 4);
  assert.equal(result.positionedActive, 1);
  assert.equal(result.missingOperationalPosition, 3);
  assert.equal(result.primaryStates.UNKNOWN, 0);
});

test('explicit UNKNOWN Layer 1 remains a real primary state when present', () => {
  const result = reconcileTowerPopulation({
    activeMembershipRows,
    regnrAliasRows,
    openPrimaryPeriods: [{ regnr: 'DDD444', period_type: 'UNKNOWN' }],
    openActivities: [],
  });

  assert.equal(result.positionedActive, 1);
  assert.equal(result.primaryStates.UNKNOWN, 1);
  assert.equal(result.missingOperationalPosition, 3);
});

test('WORKSHOP is counted only inside canonical ACTIVE DOWNTIME', () => {
  const result = reconcileTowerPopulation({
    activeMembershipRows,
    regnrAliasRows,
    openPrimaryPeriods: [
      { regnr: 'BBB222', period_type: 'DOWNTIME' },
      { regnr: 'ZZZ999', period_type: 'DOWNTIME' },
    ],
    openActivities: [
      { regnr: 'BBB222', activity_type: 'WORKSHOP' },
      { regnr: 'ZZZ999', activity_type: 'WORKSHOP' },
    ],
  });

  assert.equal(result.workshopCaptured, 1);
  assert.equal(result.reconciliation.outsideActivePrimaryStateVehicles, 1);
});

test('ambiguous canonical registration aliases fail closed from the active partition', () => {
  const result = reconcileTowerPopulation({
    activeMembershipRows: [{ identity_id: 'i1' }],
    regnrAliasRows: [
      { identity_id: 'i1', alias_value: 'AAA111' },
      { identity_id: 'i1', alias_value: 'BBB222' },
    ],
    openPrimaryPeriods: [{ regnr: 'AAA111', period_type: 'AVAILABLE' }],
    openActivities: [],
  });

  assert.equal(result.active, 1);
  assert.equal(result.positionedActive, 0);
  assert.equal(result.missingOperationalPosition, 1);
  assert.equal(result.reconciliation.activeIdentityAliasIssues, 1);
  assert.equal(result.reconciliation.ambiguousActiveLayer1Vehicles, 1);
});

test('duplicate open Layer 1 rows fail closed and never position the active vehicle', () => {
  const result = reconcileTowerPopulation({
    activeMembershipRows: [{ identity_id: 'i1' }],
    regnrAliasRows: [{ identity_id: 'i1', alias_value: 'AAA111' }],
    openPrimaryPeriods: [
      { regnr: 'AAA111', period_type: 'AVAILABLE' },
      { regnr: 'AAA111', period_type: 'DOWNTIME' },
    ],
    openActivities: [],
  });

  assert.equal(result.positionedActive, 0);
  assert.equal(result.missingOperationalPosition, 1);
  assert.equal(result.primaryStates.AVAILABLE, 0);
  assert.equal(result.primaryStates.DOWNTIME, 0);
  assert.equal(result.reconciliation.duplicateOpenLayer1Vehicles, 1);
});
