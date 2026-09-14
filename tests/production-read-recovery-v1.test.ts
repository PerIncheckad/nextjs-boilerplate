import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const authClient = readFileSync('lib/api-auth-client.ts', 'utf8');
const garage = readFileSync('app/garage/garage-client.tsx', 'utf8');
const hjulskifte = readFileSync('app/hjulskifte/hjulskifte-panel.tsx', 'utf8');
const rapport = readFileSync('app/rapport/page.tsx', 'utf8');
const layer1Report = readFileSync('app/rapport/layer1-period-duration-report.tsx', 'utf8');
const tower = readFileSync('app/tower/tower-invisto-v2.tsx', 'utf8');
const towerReadModel = readFileSync('app/api/tower/read-model/route.ts', 'utf8');

test('recovery helper injects the current Supabase bearer token for protected same-origin API reads', () => {
  assert.match(authClient, /export async function authenticatedApiFetch/);
  assert.match(authClient, /supabase\.auth\.getSession\(\)/);
  assert.match(authClient, /headers\.set\('Authorization', `Bearer \$\{accessToken\}`\)/);
  assert.match(authClient, /url\.origin === window\.location\.origin/);
  assert.match(authClient, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(authClient, /url\.pathname !== '\/api\/health'/);
});

test('Garage read path is explicit authenticated API -> UI state -> render', () => {
  assert.match(garage, /authenticatedApiFetch\('\/api\/garage'/);
  assert.match(garage, /setItems\(payload\.data \?\? \[\]\)/);
  assert.match(garage, /visible\.map\(\(item\)/);
  assert.match(garage, /returadress/);
});

test('Hjulskifte reads both locked API sources through authenticated fetch without redefining population semantics', () => {
  assert.match(hjulskifte, /authenticatedApiFetch\('\/api\/garage\/wheel-changes'/);
  assert.match(hjulskifte, /authenticatedApiFetch\('\/api\/garage\/wheel-storage'/);
  assert.match(hjulskifte, /setCandidates\(payload\.candidates \?\? \[\]\)/);
  assert.match(hjulskifte, /UNKNOWN_WHEEL_STATUS/);
  assert.match(hjulskifte, /REQUIRES_CHANGE/);
  assert.doesNotMatch(hjulskifte, /366\s*(?:bilar|objekt|candidates|kandidater)/i);
});

test('Rapport Check-in and Layer 1 reads use authenticated API fetch and retain signed metric contracts', () => {
  assert.match(rapport, /authenticatedApiFetch\('\/api\/analytics\/checkin-completed-count'/);
  assert.match(layer1Report, /authenticatedApiFetch\('\/api\/analytics\/layer1-period-duration'/);
  assert.match(rapport, /SIGNED_METRIC_EVALUATION_V1/);
  assert.match(layer1Report, /SIGNED_METRIC_EVALUATION_V1/);
  assert.match(rapport, /setMetricResult\(result\)/);
  assert.match(layer1Report, /setResult\(next\)/);
});

test('Tower recovery authenticates the read while preserving blocked canonical fleet truths', () => {
  assert.match(tower, /authenticatedApiFetch\('\/api\/tower\/read-model'/);
  assert.match(towerReadModel, /active:\s*fleetMembershipVerified\s*\?\s*canonicalActiveCount\s*:\s*null/);
  assert.match(towerReadModel, /canonicalCandidateCount:\s*null/);
  assert.match(tower, /wheelChange\.openProcessRows/);
  assert.match(tower, /öppna processrader/);
  assert.doesNotMatch(tower, /value:\s*data\.processes\.wheelChange\.canonicalCandidateCount/);
});

test('recovery UI sources do not introduce direct browser database reads or writes', () => {
  for (const source of [garage, hjulskifte, rapport, layer1Report, tower]) {
    assert.doesNotMatch(source, /\bsupabase\s*\.\s*(?:from|rpc)\s*\(/);
  }
});
