import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTowerCsv } from '../lib/tower-export';

test('Tower CSV export preserves operational evidence fields', () => {
  const csv = buildTowerCsv([
    {
      regnr: 'ABC123',
      station: 'MALMÖ',
      state: 'DOWNTIME',
      stateStartedAt: '2026-08-25T00:00:00.000Z',
      downtimeReason: 'Skada, vänster dörr',
      attention: ['DOWNTIME', 'FÖRSENAD'],
      ownerFunctions: ['BILKONTROLL'],
      actionStatus: 'IN_PROGRESS',
      deadlineAt: '2026-08-25T01:00:00.000Z',
      overdue: true,
      waitingVerification: false,
      nextSteps: ['Genomför åtgärd'],
    },
  ], '2026-08-25T02:00:00.000Z');

  assert.match(csv, /"generated_at","regnr","station","state"/);
  assert.match(csv, /"ABC123"/);
  assert.match(csv, /"DOWNTIME \| FÖRSENAD"/);
  assert.match(csv, /"Skada, vänster dörr"/);
  assert.match(csv, /"true","false"/);
});

test('Tower CSV export escapes quotes and never invents missing values', () => {
  const csv = buildTowerCsv([
    {
      regnr: 'XYZ789',
      station: null,
      state: null,
      stateStartedAt: null,
      downtimeReason: 'Väntar på "del"',
      attention: [],
      ownerFunctions: [],
      actionStatus: null,
      deadlineAt: null,
      overdue: false,
      waitingVerification: true,
      nextSteps: [],
    },
  ], '2026-08-25T02:00:00.000Z');

  assert.match(csv, /"Väntar på ""del"""/);
  assert.match(csv, /"XYZ789","","",""/);
});
