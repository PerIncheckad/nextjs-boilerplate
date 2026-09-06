import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCurrentOdometer,
  type CurrentOdometerObservation,
} from '../lib/status-current-odometer';
import type { StatusReadModelSourceData } from '../lib/status-read-model-source';

function sourceData(
  overrides: Partial<StatusReadModelSourceData> = {},
): StatusReadModelSourceData {
  return {
    nybil: null,
    vehicle: [],
    damages: [],
    legacyDamages: [],
    checkins: [],
    arrivals: [],
    vehicleEdits: [],
    damageComments: [],
    checkinDamages: [],
    saluState: null,
    currentWheelFact: null,
    ...overrides,
  };
}

function expectObservation(
  actual: CurrentOdometerObservation | null,
  expected: CurrentOdometerObservation,
): void {
  assert.deepEqual(actual, expected);
}

test('later Ankomst beats older completed Check-in', () => {
  const actual = resolveCurrentOdometer(sourceData({
    checkins: [{
      status: 'COMPLETED',
      odometer_km: 34559,
      completed_at: '2026-08-24T07:27:31.000Z',
      checker_name: 'Check In',
    }],
    arrivals: [{
      odometer_km: 41688,
      created_at: '2026-09-04T15:01:28.000Z',
      checker_name: 'Arrival User',
    }],
  }));

  expectObservation(actual, {
    value: 41688,
    timestamp: '2026-09-04T15:01:28.000Z',
    source: 'ankomst',
    actor: 'Arrival User',
  });
});

test('later completed Check-in beats older Status odometer edit', () => {
  const actual = resolveCurrentOdometer(sourceData({
    checkins: [{
      status: 'COMPLETED',
      odometer_km: 21000,
      completed_at: '2026-09-05T10:00:00.000Z',
      checker_name: 'Checker',
    }],
    vehicleEdits: [{
      field_name: 'matarstallning',
      new_value: '20500',
      edited_at: '2026-09-04T10:00:00.000Z',
      edited_by: 'status.user@example.com',
    }],
  }));

  expectObservation(actual, {
    value: 21000,
    timestamp: '2026-09-05T10:00:00.000Z',
    source: 'incheckning',
    actor: 'Checker',
  });
});

test('later Status odometer edit beats older Check-in and Ankomst', () => {
  const actual = resolveCurrentOdometer(sourceData({
    checkins: [{
      status: 'COMPLETED',
      odometer_km: 21000,
      completed_at: '2026-09-03T10:00:00.000Z',
      checker_name: 'Checker',
    }],
    arrivals: [{
      odometer_km: 21100,
      created_at: '2026-09-04T10:00:00.000Z',
      checker_name: 'Arrival User',
    }],
    vehicleEdits: [{
      field_name: 'matarstallning',
      new_value: '21234',
      edited_at: '2026-09-05T10:00:00.000Z',
      edited_by: 'anna.andersson@example.com',
    }],
  }));

  expectObservation(actual, {
    value: 21234,
    timestamp: '2026-09-05T10:00:00.000Z',
    source: 'status',
    actor: 'Anna Andersson',
  });
});

test('incomplete Check-in is not a legitimate current odometer observation', () => {
  const actual = resolveCurrentOdometer(sourceData({
    nybil: {
      matarstallning_inkop: 100,
      created_at: '2026-09-01T08:00:00.000Z',
      fullstandigt_namn: 'Nybil User',
    },
    checkins: [{
      status: 'DRAFT',
      odometer_km: 999999,
      completed_at: '2026-09-06T08:00:00.000Z',
      checker_name: 'Draft User',
    }],
  }));

  expectObservation(actual, {
    value: 100,
    timestamp: '2026-09-01T08:00:00.000Z',
    source: 'nybil',
    actor: 'Nybil User',
  });
});

test('Nybil current meter is the baseline fallback when no later verified observation exists', () => {
  const actual = resolveCurrentOdometer(sourceData({
    nybil: {
      matarstallning_inkop: 100,
      matarstallning_aktuell: 125,
      created_at: '2026-09-01T08:00:00.000Z',
      registrerad_av: 'nybil.user@example.com',
    },
  }));

  expectObservation(actual, {
    value: 125,
    timestamp: '2026-09-01T08:00:00.000Z',
    source: 'nybil',
    actor: 'Nybil User',
  });
});
