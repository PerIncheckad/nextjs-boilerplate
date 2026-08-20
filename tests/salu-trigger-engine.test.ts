import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateSaluTriggers } from '../lib/salu-trigger-engine';

test('T-30 creates a flag action exactly on trigger date when no active flag exists', () => {
  const result = evaluateSaluTriggers({
    today: '2026-08-01',
    saludatum: '2026-08-31',
    hasActiveFlag: false,
  });

  assert.deepEqual(result, {
    actions: [
      {
        type: 'SALU_FLAG_CREATED',
        eventKey: 'SALU_FLAG_CREATED:2026-08-31',
        saludatum: '2026-08-31',
      },
    ],
    requiresCatchUpPolicy: false,
  });
});

test('no active flag after T-30 is surfaced as unresolved catch-up policy instead of guessed automation', () => {
  const result = evaluateSaluTriggers({
    today: '2026-08-20',
    saludatum: '2026-08-31',
    hasActiveFlag: false,
  });

  assert.deepEqual(result, { actions: [], requiresCatchUpPolicy: true });
});

test('before T-30 no flag action is due', () => {
  const result = evaluateSaluTriggers({
    today: '2026-07-31',
    saludatum: '2026-08-31',
    hasActiveFlag: false,
  });

  assert.deepEqual(result, { actions: [], requiresCatchUpPolicy: false });
});

test('active flag starts a ten-day decision clock from flag creation', () => {
  const before = evaluateSaluTriggers({
    today: '2026-08-10',
    saludatum: '2026-09-30',
    hasActiveFlag: true,
    activeFlagId: 'flag-1',
    activeFlagCreatedDate: '2026-08-01',
    activeFlagEscalation: 'NORMAL',
  });
  assert.deepEqual(before.actions, []);

  const due = evaluateSaluTriggers({
    today: '2026-08-11',
    saludatum: '2026-09-30',
    hasActiveFlag: true,
    activeFlagId: 'flag-1',
    activeFlagCreatedDate: '2026-08-01',
    activeFlagEscalation: 'NORMAL',
  });
  assert.deepEqual(due.actions, [{
    type: 'SALU_DECISION_REMINDER_DUE',
    eventKey: 'SALU_DECISION_REMINDER_DUE:flag-1:1',
    saludatum: '2026-09-30',
  }]);
});

test('decision reminder is emitted once per ten-day cycle while the flag remains active', () => {
  const result = evaluateSaluTriggers({
    today: '2026-08-25',
    saludatum: '2026-09-30',
    hasActiveFlag: true,
    activeFlagId: 'flag-1',
    activeFlagCreatedDate: '2026-08-01',
    activeFlagEscalation: 'NORMAL',
    emittedEventKeys: ['SALU_DECISION_REMINDER_DUE:flag-1:1'],
  });

  assert.deepEqual(result.actions, [{
    type: 'SALU_DECISION_REMINDER_DUE',
    eventKey: 'SALU_DECISION_REMINDER_DUE:flag-1:2',
    saludatum: '2026-09-30',
  }]);
});

test('NORMAL active flag reaching T10 emits T10 once for the current saludatum', () => {
  const first = evaluateSaluTriggers({
    today: '2026-08-21',
    saludatum: '2026-08-31',
    hasActiveFlag: true,
    activeFlagEscalation: 'NORMAL',
  });

  assert.equal(first.actions[0]?.type, 'SALU_T10_ESCALATED');

  const second = evaluateSaluTriggers({
    today: '2026-08-22',
    saludatum: '2026-08-31',
    hasActiveFlag: true,
    activeFlagEscalation: 'NORMAL',
    emittedEventKeys: [first.actions[0]!.eventKey],
  });

  assert.deepEqual(second.actions, []);
});

test('T10 catch-up flag does not emit a synthetic T10 event inside the T10 window', () => {
  const result = evaluateSaluTriggers({
    today: '2026-08-22',
    saludatum: '2026-08-31',
    hasActiveFlag: true,
    activeFlagEscalation: 'T10',
  });

  assert.deepEqual(result.actions, []);
});

test('PASSERAD catch-up flag does not emit synthetic T10 or T0 events', () => {
  const atT0 = evaluateSaluTriggers({
    today: '2026-08-31',
    saludatum: '2026-08-31',
    hasActiveFlag: true,
    activeFlagEscalation: 'PASSERAD',
  });
  assert.deepEqual(atT0.actions, []);

  const afterT0 = evaluateSaluTriggers({
    today: '2026-09-10',
    saludatum: '2026-08-31',
    hasActiveFlag: true,
    activeFlagEscalation: 'PASSERAD',
  });
  assert.deepEqual(afterT0.actions, []);
});

test('T10 active flag reaching T0 emits the normal T0 transition', () => {
  const result = evaluateSaluTriggers({
    today: '2026-08-31',
    saludatum: '2026-08-31',
    hasActiveFlag: true,
    activeFlagEscalation: 'T10',
  });

  assert.deepEqual(result.actions.map((action) => action.type), ['SALU_T0_PASSED']);
});

test('active NORMAL flag emits T0/PASSERAD on saludatum and suppresses retrospective T10', () => {
  const result = evaluateSaluTriggers({
    today: '2026-08-31',
    saludatum: '2026-08-31',
    hasActiveFlag: true,
    activeFlagEscalation: 'NORMAL',
  });

  assert.deepEqual(result.actions.map((action) => action.type), ['SALU_T0_PASSED']);
});

test('a changed saludatum gets its own idempotency key so a later T10 can be emitted again', () => {
  const result = evaluateSaluTriggers({
    today: '2026-10-21',
    saludatum: '2026-10-31',
    hasActiveFlag: true,
    activeFlagEscalation: 'NORMAL',
    emittedEventKeys: ['SALU_T10_ESCALATED:2026-08-31'],
  });

  assert.deepEqual(result.actions, [
    {
      type: 'SALU_T10_ESCALATED',
      eventKey: 'SALU_T10_ESCALATED:2026-10-31',
      saludatum: '2026-10-31',
    },
  ]);
});

test('T0 catch-up for an active flag is idempotent for the current saludatum', () => {
  const result = evaluateSaluTriggers({
    today: '2026-09-02',
    saludatum: '2026-08-31',
    hasActiveFlag: true,
    activeFlagEscalation: 'T10',
    emittedEventKeys: ['SALU_T0_PASSED:2026-08-31'],
  });

  assert.deepEqual(result.actions, []);
});
