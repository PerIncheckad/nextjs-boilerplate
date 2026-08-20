import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acknowledgeSaluFlag,
  applyActiveSaludatumChange,
  assessSaluCloseReadiness,
  closeSaluFlagManually,
  createReopenedSaluFlag,
  moveSaluFlagToFinalAssessment,
  transitionSaluChildStatus,
  validateSaluClosureDecision,
  type SaluFlagSnapshot,
} from '../lib/salu-process';

const activeFlag: SaluFlagSnapshot = {
  flagId: 'flag-1',
  regnr: 'ABC123',
  cycleSaludatum: '2026-08-31',
  currentSaludatum: '2026-08-31',
  status: 'NY',
  escalationStatus: 'T10',
};

test('NY flag is acknowledged into HANDLÄGGS without changing ownership identity fields', () => {
  const next = acknowledgeSaluFlag(activeFlag);
  assert.equal(next.status, 'HANDLÄGGS');
  assert.equal(next.flagId, activeFlag.flagId);
  assert.equal(next.regnr, activeFlag.regnr);
});

test('child process follows CREATED -> ACCEPTED -> IN_PROGRESS -> READY_FOR_VERIFICATION -> VERIFIED', () => {
  let status = transitionSaluChildStatus('CREATED', 'ACCEPTED');
  status = transitionSaluChildStatus(status, 'IN_PROGRESS');
  status = transitionSaluChildStatus(status, 'READY_FOR_VERIFICATION');
  status = transitionSaluChildStatus(status, 'VERIFIED');
  assert.equal(status, 'VERIFIED');
});

test('verification rejection returns the same child process to IN_PROGRESS', () => {
  assert.equal(
    transitionSaluChildStatus('READY_FOR_VERIFICATION', 'IN_PROGRESS'),
    'IN_PROGRESS',
  );
});

test('child process cannot skip ACCEPTED and terminal states cannot reopen', () => {
  assert.throws(
    () => transitionSaluChildStatus('CREATED', 'IN_PROGRESS'),
    /Invalid SALU child transition/,
  );
  assert.throws(
    () => transitionSaluChildStatus('VERIFIED', 'IN_PROGRESS'),
    /Terminal SALU child status/,
  );
});

test('close readiness blocks on VÄNTAR checkpoint and non-terminal child process', () => {
  const readiness = assessSaluCloseReadiness({
    checkpointStatuses: ['GODKÄND', 'VÄNTAR', 'AVVIKELSE'],
    childStatuses: ['VERIFIED', 'IN_PROGRESS'],
  });

  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.reasons, ['CHECKPOINT_VÄNTAR', 'CHILD_PROCESS_NOT_TERMINAL']);
});

test('VERIFIED and CANCELLED are terminal child statuses for close readiness', () => {
  const readiness = assessSaluCloseReadiness({
    checkpointStatuses: ['GODKÄND', 'AVVIKELSE', 'EJ RELEVANT'],
    childStatuses: ['VERIFIED', 'CANCELLED'],
  });

  assert.deepEqual(readiness, { ready: true, reasons: [] });
});

test('manual close requires SLUTBEDÖMNING, ready conditions and an explicit decision', () => {
  const acknowledged = acknowledgeSaluFlag(activeFlag);
  const readiness = assessSaluCloseReadiness({ checkpointStatuses: ['GODKÄND'], childStatuses: ['VERIFIED'] });
  const finalAssessment = moveSaluFlagToFinalAssessment(acknowledged, readiness);
  const closed = closeSaluFlagManually(finalAssessment, readiness, { decision: 'SÄLJAS' });

  assert.equal(finalAssessment.status, 'SLUTBEDÖMNING');
  assert.equal(closed.status, 'STÄNGD');
});

test('ANNAT requires comment and FÖRLÄNGA requires a new saludatum', () => {
  assert.throws(
    () => validateSaluClosureDecision({ decision: 'ANNAT' }),
    /requires a closure comment/,
  );
  assert.doesNotThrow(() => validateSaluClosureDecision({ decision: 'ANNAT', comment: 'Specialfall' }));

  assert.throws(
    () => validateSaluClosureDecision({ decision: 'FÖRLÄNGA' }),
    /requires a new saludatum/,
  );
  assert.doesNotThrow(() => validateSaluClosureDecision({
    decision: 'FÖRLÄNGA',
    newSaludatum: '2026-10-31',
  }));
});

test('final assessment cannot be entered directly from NY', () => {
  const readiness = assessSaluCloseReadiness({ checkpointStatuses: ['GODKÄND'], childStatuses: [] });
  assert.throws(
    () => moveSaluFlagToFinalAssessment(activeFlag, readiness),
    /HANDLÄGGS or VÄNTAR/,
  );
});

test('active saludatum change keeps the same flag and recalculates escalation snapshot', () => {
  const acknowledged = acknowledgeSaluFlag(activeFlag);
  const changed = applyActiveSaludatumChange({
    snapshot: acknowledged,
    newSaludatum: '2026-10-31',
    today: '2026-08-20',
  });

  assert.equal(changed.flagId, acknowledged.flagId);
  assert.equal(changed.cycleSaludatum, acknowledged.cycleSaludatum);
  assert.equal(changed.currentSaludatum, '2026-10-31');
  assert.equal(changed.escalationStatus, 'NORMAL');
});

test('closed flag cannot be mutated by active-plan date change', () => {
  const closed: SaluFlagSnapshot = { ...activeFlag, status: 'STÄNGD' };

  assert.throws(
    () => applyActiveSaludatumChange({ snapshot: closed, newSaludatum: '2026-10-31', today: '2026-08-20' }),
    /closed SALU flag/i,
  );
});

test('reopening creates a new NY flag and keeps previous flag identity historical', () => {
  const previous: SaluFlagSnapshot = {
    ...activeFlag,
    status: 'STÄNGD',
    currentSaludatum: '2026-08-19',
    escalationStatus: 'PASSERAD',
  };

  const reopened = createReopenedSaluFlag({ previous, newFlagId: 'flag-2', today: '2026-08-20' });

  assert.equal(reopened.flagId, 'flag-2');
  assert.equal(reopened.previousFlagId, 'flag-1');
  assert.equal(reopened.status, 'NY');
  assert.equal(reopened.currentSaludatum, '2026-08-19');
  assert.equal(reopened.cycleSaludatum, '2026-08-19');
  assert.equal(reopened.escalationStatus, 'PASSERAD');
  assert.equal(previous.status, 'STÄNGD');
});
