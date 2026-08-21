import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationalReadModel } from '../lib/vehicle-operational-read-model';

// Contract guard: the read model may expose VERIFIED facts or UNKNOWN, never inferred state.
test('ingen öppen period ger UNKNOWN och skapar inget antaget tillstånd', () => {
  const model = buildOperationalReadModel([], []);
  assert.equal(model.knowledgeState, 'UNKNOWN');
  assert.equal(model.currentVerifiedState, null);
  assert.equal(model.stateStartedAt, null);
  assert.equal(model.confirmationCount, 0);
  assert.equal(model.sale.state, 'UNKNOWN');
});

test('öppen verifierad DOWNTIME exponeras med källa och orsak', () => {
  const model = buildOperationalReadModel([
    {
      period_id: 'p1',
      period_type: 'DOWNTIME',
      started_at: '2026-08-21T12:32:00Z',
      ended_at: null,
      reason_code: 'OTHER',
      reason_text: 'Punktering',
      source_system: 'CHECKIN',
      source_entity: 'checkins',
      source_record_id: 'c1',
    },
  ], []);

  assert.equal(model.knowledgeState, 'VERIFIED');
  assert.equal(model.currentVerifiedState, 'DOWNTIME');
  assert.equal(model.stateStartedAt, '2026-08-21T12:32:00Z');
  assert.equal(model.reasonText, 'Punktering');
  assert.equal(model.establishedBySource, 'CHECKIN');
  assert.equal(model.establishedByEntity, 'checkins');
});

test('DOWNTIME_CONFIRMED räknas endast när eventet pekar på aktuell öppna period', () => {
  const periods = [{
    period_id: 'p1',
    period_type: 'DOWNTIME',
    started_at: '2026-08-21T12:32:00Z',
    ended_at: null,
    reason_code: 'OTHER',
    reason_text: 'Punktering',
    source_system: 'CHECKIN',
    source_entity: 'checkins',
    source_record_id: 'c1',
  }];

  const model = buildOperationalReadModel(periods, [
    {
      event_id: 'e1',
      event_type: 'DOWNTIME_CONFIRMED',
      occurred_at: '2026-08-21T14:00:00Z',
      source_system: 'CHECKIN',
      source_entity: 'checkins',
      source_record_id: 'c2',
      payload: { existingPeriodId: 'p1' },
    },
    {
      event_id: 'e2',
      event_type: 'DOWNTIME_CONFIRMED',
      occurred_at: '2026-08-21T15:00:00Z',
      source_system: 'CHECKIN',
      source_entity: 'checkins',
      source_record_id: 'c3',
      payload: { existingPeriodId: 'annan-period' },
    },
  ]);

  assert.equal(model.confirmationCount, 1);
  assert.equal(model.lastConfirmedAt, '2026-08-21T14:00:00Z');
  assert.equal(model.latestConfirmationSource, 'CHECKIN');
});

test('SÅLD hålls separat från operativ period och korrigering blir NOT_SOLD', () => {
  const model = buildOperationalReadModel([], [
    {
      event_id: 'sold',
      event_type: 'VEHICLE_SOLD_RECORDED',
      occurred_at: '2026-08-21T10:00:00Z',
      source_system: 'STATUS',
      source_entity: 'vehicle_edits',
      source_record_id: '1',
    },
    {
      event_id: 'corrected',
      event_type: 'VEHICLE_SOLD_CORRECTED',
      occurred_at: '2026-08-21T11:00:00Z',
      source_system: 'STATUS',
      source_entity: 'vehicle_edits',
      source_record_id: '2',
      correction_of_event_id: 'sold',
    },
  ]);

  assert.equal(model.knowledgeState, 'UNKNOWN');
  assert.equal(model.currentVerifiedState, null);
  assert.equal(model.sale.state, 'NOT_SOLD');
  assert.equal(model.sale.occurredAt, '2026-08-21T11:00:00Z');
});
