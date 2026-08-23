import assert from 'node:assert/strict';
import test from 'node:test';
import { nextDecisionReminder, saluMilestoneDate } from '../lib/routine-sla';

test('SALU milestones follow locked T-30, T-10 and T0 offsets', () => {
  const saludatum = new Date('2026-10-01T00:00:00Z');
  assert.equal(saluMilestoneDate(saludatum, -30).toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(saluMilestoneDate(saludatum, -10).toISOString(), '2026-09-21T00:00:00.000Z');
  assert.equal(saluMilestoneDate(saludatum, 0).toISOString(), '2026-10-01T00:00:00.000Z');
});

test('SALU decision reminders use 10-day cycles from flag creation', () => {
  const created = new Date('2026-08-20T08:20:20Z');
  assert.equal(nextDecisionReminder(created, 1).toISOString(), '2026-08-30T08:20:20.000Z');
  assert.equal(nextDecisionReminder(created, 2).toISOString(), '2026-09-09T08:20:20.000Z');
  assert.throws(() => nextDecisionReminder(created, 0));
});
