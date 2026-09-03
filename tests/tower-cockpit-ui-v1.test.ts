import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/tower/page.tsx'), 'utf8');
const cockpit = readFileSync(join(process.cwd(), 'app/tower/tower-cockpit-v2.tsx'), 'utf8');

const compact = (value: string) => value.replace(/\s+/g, ' ');

test('Tower entrypoint presents the operational cockpit, not the old attention workflow', () => {
  const source = compact(page);
  assert.match(source, /TowerCockpitV2/);
  assert.match(source, /HELHET \/ STATUS \/ PROCESS \/ UPPMÄRKSAMHET/);
  assert.doesNotMatch(source, /OperatorCockpit/);
  assert.doesNotMatch(source, /UPPMÄRKSAMHET \/ ANSVAR \/ DEADLINE \/ BEVIS/);
});

test('cockpit reads only the canonical Tower read model', () => {
  assert.match(cockpit, /fetch\('\/api\/tower\/read-model'/);
  assert.doesNotMatch(cockpit, /\/api\/operator-cockpit/);
  assert.doesNotMatch(cockpit, /\.insert\(/);
  assert.doesNotMatch(cockpit, /\.update\(/);
  assert.doesNotMatch(cockpit, /\.delete\(/);
  assert.doesNotMatch(cockpit, /fetch\([^\n]*method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i);
});

test('fleet truth remains visibly blocked instead of fabricated', () => {
  assert.match(cockpit, /Väntar verifierad fleet-baseline/);
  assert.match(cockpit, /value == null \? '—'/);
  assert.match(cockpit, /BLOCKERAD/);
  assert.match(cockpit, /Fångad Layer-1/);
  assert.match(cockpit, /Källa blockerad/);
});

test('process overlays and attention are visually separated from fleet state', () => {
  assert.match(cockpit, /PROCESSER & INFLÖDE/);
  assert.match(cockpit, /ska inte summeras med AKTIVA/);
  assert.match(cockpit, /KRÄVER UPPMÄRKSAMHET/);
  assert.match(cockpit, /inte Towers huvudpopulation/);
});

test('cockpit exposes the agreed major domains without taking ownership', () => {
  for (const label of ['SALU', 'GARAGET', 'HJULSKIFTE', 'PLANERADE INKÖP', 'AVVECKLA']) {
    assert.match(cockpit, new RegExp(label));
  }
  assert.match(cockpit, /Tower läser brett; ingripanden sker genom ägande process/);
});
