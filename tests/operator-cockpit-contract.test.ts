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
  assert.doesNotMatch(route, /\.rpc\(/);
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

test('tower exposes existing tank receipt evidence without creating a new truth source', () => {
  assert.match(route, /from\('vehicle_receipts'\)/);
  assert.match(route, /eq\('receipt_type', 'tankning'\)/);
  assert.match(route, /select\('regnr,file_url,uploaded_at'\)/);
  assert.match(route, /tankReceiptCount/);
  assert.doesNotMatch(route, /uploaded_by_email/);
  assert.match(client, /Evidens/);
  assert.match(client, /Tankkvitto/);
  assert.match(client, /target="_blank"/);
});
