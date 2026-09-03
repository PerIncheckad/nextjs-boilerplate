import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/tower/page.tsx'), 'utf8');
const cockpit = readFileSync(join(process.cwd(), 'app/tower/tower-invisto-v2.tsx'), 'utf8');

const compact = (value: string) => value.replace(/\s+/g, ' ');

test('Tower entrypoint uses the Invisto UX v2 product layer', () => {
  const source = compact(page);
  assert.match(source, /TowerInvistoV2/);
  assert.match(source, /VERKSAMHETEN JUST NU/);
  assert.doesNotMatch(source, /OperatorCockpit/);
});

test('cockpit leads with the governing user question', () => {
  assert.match(cockpit, /Hur ser min verksamhet ut just nu\?/);
  assert.match(cockpit, /Helhet först\. Avvikelse därefter/);
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
  assert.match(cockpit, /Full flottsanning inväntar AKTIVA-baseline/);
});

test('processes and attention remain visually and semantically separated', () => {
  assert.match(cockpit, /VERKSAMHETEN I RÖRELSE/);
  assert.match(cockpit, /Processer kan överlappa flottan och ska inte summeras med AKTIVA/);
  assert.match(cockpit, /KRÄVER UPPMÄRKSAMHET/);
});

test('agreed major domains remain present without creating new Tower truth', () => {
  for (const label of ['SALU', 'Garaget', 'Hjulskifte', 'Planerade inköp', 'Avveckla']) {
    assert.match(cockpit, new RegExp(label));
  }
  assert.match(cockpit, /Gå till ansvarig process/);
});
