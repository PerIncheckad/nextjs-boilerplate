import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync('app/api/operator-cockpit/route.ts', 'utf8');
const client = readFileSync('app/tower/tower-client.tsx', 'utf8');

test('operator cockpit is authenticated and read-only', () => {
  assert.match(route, /verifyApiUser/);
  assert.match(route, /createClient/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.delete\(/);
});

test('cockpit answers the locked operational attention questions', () => {
  for (const field of [
    'DOWNTIME',
    'BLOCKERANDE_KONTROLLPUNKT',
    'BLOCKERANDE_ACTION',
    'BLOCKERANDE_HANDSLAG',
    'FÖRSENAD',
    'VÄNTAR_VERIFIERING',
    'station',
    'nextSteps',
  ]) {
    assert.match(route, new RegExp(field));
  }
});

test('tower links to vagnkort rather than duplicating vehicle history', () => {
  assert.match(route, /\/vagnkort\?reg=/);
  assert.match(client, /Aktuella operativa ärenden/);
  assert.match(client, /Vagnkortet innehåller individresan och evidensen/);
});
