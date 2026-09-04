import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/tower/page.tsx'), 'utf8');
const cockpit = readFileSync(join(process.cwd(), 'app/tower/tower-invisto-v2.tsx'), 'utf8');

const compact = (value: string) => value.replace(/\s+/g, ' ');

test('Tower entrypoint uses the Invisto product layer', () => {
  const source = compact(page);
  assert.match(source, /TowerInvistoV2/);
  assert.match(source, /VERKSAMHETEN JUST NU/);
  assert.doesNotMatch(source, /OperatorCockpit/);
});

test('cockpit leads with the governing user question and Invisto operational intelligence frame', () => {
  assert.match(cockpit, /Hur ser min verksamhet ut just nu\?/);
  assert.match(cockpit, /INVISTO \/ OPERATIONAL INTELLIGENCE/);
  assert.match(cockpit, /Position\. Rörelse\. Friktion\./);
});

test('cockpit remains a read-only consumer of the canonical Tower read model', () => {
  assert.match(cockpit, /fetch\('\/api\/tower\/read-model'/);
  assert.doesNotMatch(cockpit, /\/api\/operator-cockpit/);
  assert.doesNotMatch(cockpit, /\.insert\(/);
  assert.doesNotMatch(cockpit, /\.update\(/);
  assert.doesNotMatch(cockpit, /\.delete\(/);
  assert.doesNotMatch(cockpit, /fetch\([^\n]*method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i);
});

test('fleet truth is not fabricated when the active baseline is unavailable', () => {
  assert.match(cockpit, /value == null \? '—'/);
  assert.match(cockpit, /Inväntar underlag/);
  assert.match(cockpit, /AKTIVA BILAR/);
});

test('all locked Layer 1 states remain visible including SALU primary state', () => {
  for (const state of ['AVAILABLE', 'RENTAL', 'DOWNTIME', 'PREPARATION', 'SALU', 'OTHER', 'UNKNOWN']) {
    assert.match(cockpit, new RegExp(`primaryStates\\.${state}`));
  }
  assert.match(cockpit, /SALU · primärstatus/);
  assert.match(cockpit, /SALU · process/);
});

test('position movement friction and evidence are distinct product layers', () => {
  for (const label of ['POSITION', 'RÖRELSE', 'FRIKTION', 'EVIDENS']) assert.match(cockpit, new RegExp(label));
  assert.match(cockpit, /Planerade inköp/);
  assert.match(cockpit, /Garaget/);
  assert.match(cockpit, /Hjulskifte/);
  assert.match(cockpit, /Avveckla/);
});

test('owner-process intervention principle remains intact', () => {
  assert.match(cockpit, /Gå till ansvarig process/);
  assert.doesNotMatch(cockpit, /method:\s*['"]POST['"]/i);
});
