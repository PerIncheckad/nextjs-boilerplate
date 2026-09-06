import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  parseStoredCurrentLocation,
  resolveCurrentLocation,
  serializeCurrentLocation,
} from '../lib/status-current-location';
import type { StatusReadModelSourceData } from '../lib/status-read-model-source';

function sourceData(overrides: Partial<StatusReadModelSourceData> = {}): StatusReadModelSourceData {
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

test('later Arrival beats older completed Check-in for current physical location', () => {
  const current = resolveCurrentLocation(sourceData({
    checkins: [{
      status: 'COMPLETED',
      current_city: 'Malmö',
      current_station: 'MB Malmö',
      completed_at: '2026-08-24T07:27:31.572Z',
      checker_name: 'Nimet Mecaj',
    }],
    arrivals: [{
      current_city: 'Helsingborg',
      current_station: 'MB Helsingborg',
      created_at: '2026-09-04T15:01:28.209Z',
      checker_name: 'Isak Brandeby',
    }],
  }));

  assert.deepEqual(current, {
    city: 'Helsingborg',
    station: 'MB Helsingborg',
    timestamp: '2026-09-04T15:01:28.209Z',
    source: 'ankomst',
    actor: 'Isak Brandeby',
  });
});

test('later Status correction beats older Arrival without changing source records', () => {
  const data = sourceData({
    arrivals: [{
      current_city: 'Helsingborg',
      current_station: 'MB Helsingborg',
      created_at: '2026-09-04T15:01:28.209Z',
      checker_name: 'Isak Brandeby',
    }],
    vehicleEdits: [{
      field_name: 'current_location',
      new_value: 'Malmö / MB Malmö',
      edited_at: '2026-09-05T09:00:00.000Z',
      edited_by: 'per@incheckad.se',
    }],
  });

  const originalArrival = { ...data.arrivals[0] };
  const current = resolveCurrentLocation(data);

  assert.equal(current?.city, 'Malmö');
  assert.equal(current?.station, 'MB Malmö');
  assert.equal(current?.source, 'status');
  assert.equal(current?.actor, 'Per');
  assert.deepEqual(data.arrivals[0], originalArrival);
});

test('later completed Check-in beats older Status correction', () => {
  const current = resolveCurrentLocation(sourceData({
    vehicleEdits: [{
      field_name: 'current_location',
      new_value: 'Malmö / MB Malmö',
      edited_at: '2026-09-05T09:00:00.000Z',
      edited_by: 'per@incheckad.se',
    }],
    checkins: [{
      status: 'COMPLETED',
      current_city: 'Lund',
      current_station: 'Hedin Lund',
      completed_at: '2026-09-06T08:00:00.000Z',
      checker_name: 'Verifierare',
    }],
  }));

  assert.equal(current?.city, 'Lund');
  assert.equal(current?.station, 'Hedin Lund');
  assert.equal(current?.source, 'incheckning');
});

test('incomplete Check-in is never a legitimate current-location observation', () => {
  const current = resolveCurrentLocation(sourceData({
    nybil: {
      plats_aktuell_ort: 'Malmö',
      plats_aktuell_station: 'MB Malmö',
      created_at: '2026-08-01T10:00:00.000Z',
      fullstandigt_namn: 'Nybil Verifierare',
    },
    checkins: [{
      status: 'DRAFT',
      current_city: 'Helsingborg',
      current_station: 'MB Helsingborg',
      completed_at: '2026-09-06T10:00:00.000Z',
      checker_name: 'Ej klar',
    }],
  }));

  assert.equal(current?.city, 'Malmö');
  assert.equal(current?.station, 'MB Malmö');
  assert.equal(current?.source, 'nybil');
});

test('Status current-location storage is one atomic city and station value', () => {
  assert.equal(serializeCurrentLocation(' Helsingborg ', ' MB Helsingborg '), 'Helsingborg / MB Helsingborg');
  assert.deepEqual(parseStoredCurrentLocation('Helsingborg / MB Helsingborg'), {
    city: 'Helsingborg',
    station: 'MB Helsingborg',
  });
  assert.equal(parseStoredCurrentLocation('Helsingborg'), null);
  assert.equal(parseStoredCurrentLocation(' / MB Helsingborg'), null);
});

test('Status wrapper consumes current-location resolver instead of latest Check-in directly', () => {
  const wrapper = readFileSync(join(process.cwd(), 'lib/vehicle-status-current.ts'), 'utf8');
  assert.match(wrapper, /resolveCurrentLocation\(sourceData\)/);
  assert.match(wrapper, /currentLocation\.city/);
  assert.match(wrapper, /currentLocation\.station/);
  assert.doesNotMatch(wrapper, /const latestCheckin = sourceData\.checkins\[0\]/);
});

test('current-location correction is authenticated, atomic and has no process-state side effect', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/vehicle-edits/route.ts'), 'utf8');
  const legacyHandler = readFileSync(join(process.cwd(), 'app/api/vehicle-edits/legacy-handler.ts'), 'utf8');
  const locationPage = readFileSync(join(process.cwd(), 'app/status/location/location-client.tsx'), 'utf8');

  assert.match(route, /verifyApiUser\(request\)/);
  assert.match(route, /field_name === 'current_location'/);
  assert.match(route, /parseStoredCurrentLocation/);
  assert.match(route, /Current location must be saved as one atomic observation/);
  assert.match(locationPage, /field_name: 'current_location'/);
  assert.match(locationPage, /Det skapar inte Check-in, RENTAL eller AVAILABLE/);

  assert.doesNotMatch(legacyHandler, /current_location.*klar_for_uthyrning/s);
  assert.doesNotMatch(legacyHandler, /current_location.*checkins/s);
});
