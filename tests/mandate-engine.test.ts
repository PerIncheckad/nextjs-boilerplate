import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handoffCapabilityForStatus,
  isMandateActive,
  scopeMatches,
  type MandateGrant,
} from '../lib/mandate-engine';

const base: MandateGrant = {
  employeeId: 'employee-1',
  functionCode: 'BILKONTROLL',
  capabilityCode: 'HANDOFF_VERIFY',
  scopeType: 'HANDOFF',
  scopeCode: 'SALU_TO_PLANERING',
  active: true,
  validFrom: new Date('2026-08-01T00:00:00Z'),
};

test('authentication is not mandate: grant must be active and within time window', () => {
  assert.equal(isMandateActive(base, new Date('2026-08-23T12:00:00Z')), true);
  assert.equal(isMandateActive({ ...base, active: false }, new Date('2026-08-23T12:00:00Z')), false);
  assert.equal(isMandateActive({ ...base, revokedAt: new Date('2026-08-20T00:00:00Z') }, new Date('2026-08-23T12:00:00Z')), false);
});

test('global mandate matches any scope while scoped mandate matches exact scope', () => {
  assert.equal(scopeMatches({ scopeType: 'GLOBAL', scopeCode: null }, 'HANDOFF', 'X'), true);
  assert.equal(scopeMatches(base, 'HANDOFF', 'SALU_TO_PLANERING'), true);
  assert.equal(scopeMatches(base, 'HANDOFF', 'SALU_TO_INKOP'), false);
});

test('handoff transitions map to explicit capabilities', () => {
  assert.equal(handoffCapabilityForStatus('HANDED_OVER'), 'HANDOFF_HAND_OVER');
  assert.equal(handoffCapabilityForStatus('RECEIVED'), 'HANDOFF_RECEIVE');
  assert.equal(handoffCapabilityForStatus('ACCEPTED'), 'HANDOFF_ACCEPT');
  assert.equal(handoffCapabilityForStatus('COMPLETED'), 'HANDOFF_COMPLETE');
  assert.equal(handoffCapabilityForStatus('VERIFIED'), 'HANDOFF_VERIFY');
  assert.equal(handoffCapabilityForStatus('CANCELLED'), 'HANDOFF_CANCEL');
  assert.throws(() => handoffCapabilityForStatus('REQUESTED'));
});
