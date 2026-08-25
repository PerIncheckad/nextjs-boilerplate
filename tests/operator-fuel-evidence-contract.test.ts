import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync('app/api/operator-fuel-evidence/route.ts', 'utf8');
const client = readFileSync('app/tower/fuel-evidence/fuel-evidence-client.tsx', 'utf8');

test('fuel evidence endpoint is authenticated and read-only', () => {
  assert.match(route, /verifyApiUser/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.delete\(/);
  assert.doesNotMatch(route, /\.rpc\(/);
});

test('fuel evidence uses existing checkin and receipt evidence only', () => {
  assert.match(route, /from\('checkins'\)/);
  assert.match(route, /fuel_level', 'tankad_nu'/);
  assert.match(route, /from\('vehicle_receipts'\)/);
  assert.match(route, /receipt_type', 'tankning'/);
});

test('fuel evidence does not claim monetary consequence', () => {
  assert.match(route, /monetaryInterpretation: false/);
  assert.match(client, /gör ingen bedömning av kostnadsansvar/);
  assert.match(client, /Kvittotäckning/);
  assert.match(client, /Visa kvitto/);
  assert.match(client, /Vagnkort/);
});
