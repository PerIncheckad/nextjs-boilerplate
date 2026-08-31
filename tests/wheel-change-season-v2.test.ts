import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyWheelEligibility,
  operationalWheelSeason,
  summerSeason,
  winterSeason,
} from '../lib/wheel-change-season';

const migration = readFileSync('migrations/20260831031500_add_wheel_change_season_v2.sql', 'utf8');
const api = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-wheel-change-panel.tsx', 'utf8');

test('winter season and SALU exemption use the locked dates', () => {
  const season = winterSeason(2026);
  assert.equal(season.startDate, '2026-10-01');
  assert.equal(season.endDate, '2027-04-15');
  assert.equal(season.saluExemptEnd, '2026-12-05');
  assert.equal(classifyWheelEligibility(season, 'Sommardäck', '2026-12-05'), 'SALU_EXEMPT');
  assert.equal(classifyWheelEligibility(season, 'Sommardäck', '2026-12-06'), 'REQUIRES_CHANGE');
  assert.equal(classifyWheelEligibility(season, 'Vinterdäck', '2026-11-20'), 'ALREADY_CORRECT');
});

test('summer season and SALU exemption use the locked dates', () => {
  const season = summerSeason(2027);
  assert.equal(season.startDate, '2027-03-31');
  assert.equal(season.endDate, '2027-05-31');
  assert.equal(season.saluExemptStart, '2027-04-01');
  assert.equal(season.saluExemptEnd, '2027-06-05');
  assert.equal(classifyWheelEligibility(season, 'Vinterdäck', '2027-06-05'), 'SALU_EXEMPT');
  assert.equal(classifyWheelEligibility(season, 'Vinterdäck', '2027-06-06'), 'REQUIRES_CHANGE');
  assert.equal(classifyWheelEligibility(season, 'Sommardäck', null), 'ALREADY_CORRECT');
});

test('missing wheel evidence never infers a required change', () => {
  assert.equal(classifyWheelEligibility(winterSeason(2026), null, null), 'UNKNOWN_WHEEL_STATUS');
  assert.equal(classifyWheelEligibility(summerSeason(2027), '', '2027-05-01'), 'UNKNOWN_WHEEL_STATUS');
});

test('summer campaign takes operational precedence when business windows overlap', () => {
  const result = operationalWheelSeason(new Date('2027-04-10T12:00:00Z'));
  assert.equal(result.active, true);
  assert.equal(result.season.key, 'SUMMER_2027');
});

test('outside a campaign the next campaign is read-only preview', () => {
  const result = operationalWheelSeason(new Date('2026-08-31T12:00:00Z'));
  assert.equal(result.active, false);
  assert.equal(result.season.key, 'WINTER_2026');
});

test('season v2 keeps verified source data and direct regnr workflow inside Garage', () => {
  assert.match(migration, /get_wheel_change_candidate_source/);
  assert.match(migration, /c\.status = 'COMPLETED'/);
  assert.match(migration, /s\.current_saludatum/);
  assert.match(migration, /create_garage_wheel_change_for_vehicle/);
  assert.match(migration, /HJULSKIFTE_SEASON/);
  assert.match(api, /LATEST_COMPLETED_CHECKIN_PLUS_CURRENT_SALU/);
  assert.match(api, /eligibility !== 'REQUIRES_CHANGE'/);
  assert.match(api, /Hjulskiftesäsongen har inte startat ännu/);
});

test('Garage UI does not offer backend-invalid status transitions', () => {
  assert.match(panel, /KRAVS: \['KRAVS', 'BOKAD', 'PAGAENDE', 'AVVIKELSE'\]/);
  assert.match(panel, /BOKAD: \['KRAVS', 'BOKAD', 'PAGAENDE', 'AVVIKELSE'\]/);
  assert.match(panel, /PAGAENDE: \['BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE'\]/);
});
