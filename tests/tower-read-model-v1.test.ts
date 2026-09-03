import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(
  join(process.cwd(), 'app/api/tower/read-model/route.ts'),
  'utf8',
);

test('Tower read model authenticates and remains read-only', () => {
  assert.match(route, /verifyApiUser/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.delete\(/);
  assert.doesNotMatch(route, /admin\.rpc\(/);
});

test('AKTIVA cannot silently fall back to partial journey coverage', () => {
  assert.match(route, /active: null/);
  assert.match(route, /fleetMembership:[\s\S]*health: 'BLOCKED'/);
  assert.match(route, /noHeuristicFleetTruth: true/);
  assert.match(route, /capturedPrimaryStateVehicles/);
});

test('primary operational states are separated from process overlays', () => {
  assert.match(route, /AVAILABLE/);
  assert.match(route, /RENTAL/);
  assert.match(route, /DOWNTIME/);
  assert.match(route, /PREPARATION/);
  assert.match(route, /processes:/);
  assert.match(route, /salu:/);
  assert.match(route, /garage:/);
  assert.match(route, /wheelChange:/);
});

test('SALU uses open process flags and Garage excludes completed or Nybil-handed-off objects', () => {
  assert.match(route, /from\('salu_flags'\)[\s\S]*\.neq\('status', 'STÄNGD'\)/);
  assert.match(route, /row\.garage_direction === 'IN'/);
  assert.match(route, /!row\.completed_at/);
  assert.match(route, /!row\.handed_off_at/);
});

test('planned purchases use ordered minus non-voided Planering materializations', () => {
  assert.match(route, /fleet_planning_cells/);
  assert.match(route, /\.eq\('source_kind', 'PLANERING'\)/);
  assert.match(route, /Math\.max\(ordered - \(materializedByCell\.get\(cellId\) \?\? 0\), 0\)/);
});

test('Rental and Hjulskifte stay blocked or partial until their complete population contracts exist', () => {
  assert.match(route, /rental_operational_facts/);
  assert.match(route, /RENTAL must not be inferred from another source/);
  assert.match(route, /canonicalCandidateCount: null/);
  assert.match(route, /intersected with canonical AKTIVA/);
});

test('AVVECKLA remains an external read contract', () => {
  assert.match(route, /health: 'EXTERNAL'/);
  assert.match(route, /separate AVVECKLA workstream/);
});
