import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationalReadModel } from '../lib/vehicle-operational-read-model';

test('open source-owned RENTAL is VERIFIED RENTAL from G with source identity', () => {
  const model = buildOperationalReadModel([
    {
      period_id: 'rental-1',
      period_type: 'RENTAL',
      started_at: '2026-08-23T08:15:00Z',
      ended_at: null,
      reason_code: null,
      reason_text: null,
      source_system: 'RENTAL_SOURCE',
      source_entity: 'rental_operational_facts',
      source_record_id: '024-166-0006155',
    },
  ], []);

  assert.equal(model.knowledgeState, 'VERIFIED');
  assert.equal(model.currentVerifiedState, 'RENTAL');
  assert.equal(model.stateStartedAt, '2026-08-23T08:15:00Z');
  assert.equal(model.establishedBySource, 'RENTAL_SOURCE');
  assert.equal(model.establishedByEntity, 'rental_operational_facts');
  assert.equal(model.establishedByRecord, '024-166-0006155');
});

test('after H closes RENTAL with no later verified period the read model is UNKNOWN', () => {
  const model = buildOperationalReadModel([
    {
      period_id: 'rental-1',
      period_type: 'RENTAL',
      started_at: '2026-08-23T08:15:00Z',
      ended_at: '2026-08-23T09:30:00Z',
      reason_code: null,
      reason_text: null,
      source_system: 'RENTAL_SOURCE',
      source_entity: 'rental_operational_facts',
      source_record_id: '024-166-0006155',
    },
  ], []);

  assert.equal(model.knowledgeState, 'UNKNOWN');
  assert.equal(model.currentVerifiedState, null);
  assert.equal(model.stateStartedAt, null);
  assert.equal(model.establishedBySource, null);
});

test('later verified source period after H becomes current without rewriting the RENTAL return', () => {
  const model = buildOperationalReadModel([
    {
      period_id: 'rental-1',
      period_type: 'RENTAL',
      started_at: '2026-08-23T08:15:00Z',
      ended_at: '2026-08-23T09:30:00Z',
      reason_code: null,
      reason_text: null,
      source_system: 'RENTAL_SOURCE',
      source_entity: 'rental_operational_facts',
      source_record_id: '024-166-0006155',
    },
    {
      period_id: 'status-1',
      period_type: 'AVAILABLE',
      started_at: '2026-08-23T09:45:00Z',
      ended_at: null,
      reason_code: null,
      reason_text: null,
      source_system: 'STATUS',
      source_entity: 'vehicle_edits',
      source_record_id: '42',
    },
  ], []);

  assert.equal(model.knowledgeState, 'VERIFIED');
  assert.equal(model.currentVerifiedState, 'AVAILABLE');
  assert.equal(model.stateStartedAt, '2026-08-23T09:45:00Z');
  assert.equal(model.establishedBySource, 'STATUS');
});
