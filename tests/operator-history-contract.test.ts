import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync('app/api/operator-history/route.ts', 'utf8');
const client = readFileSync('app/tower/history/history-client.tsx', 'utf8');
const tower = readFileSync('app/tower/tower-client.tsx', 'utf8');

test('operator history is authenticated and read-only', () => {
  assert.match(route, /verifyApiUser/);
  assert.match(route, /vehicle_journey_events/);
  assert.match(route, /checkpoint_action_events/);
  assert.match(route, /handoff_events/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.delete\(/);
  assert.doesNotMatch(route, /\.rpc\(/);
});

test('operator history reads existing evidence without exposing actor email', () => {
  assert.match(route, /actor_source/);
  assert.doesNotMatch(route, /actor_email/);
  assert.match(route, /ALLOWED_WINDOWS = new Set\(\[24, 72, 168\]\)/);
  assert.match(route, /events: events\.slice\(0, 500\)/);
});

test('history UI states its evidence boundary and links back to operational views', () => {
  assert.match(client, /Vad har faktiskt registrerats i driften över tid\?/);
  assert.match(client, /Read-only vy över redan registrerade händelser/);
  assert.match(client, /gör ingen monetär tolkning/);
  assert.match(client, /\/vagnkort\?reg=/);
  assert.match(client, /href="\/tower"/);
  assert.match(tower, /href="\/tower\/history"/);
});
