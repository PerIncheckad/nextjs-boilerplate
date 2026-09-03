import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseOperationalDateTime } from '../lib/server/swedish-local-datetime';

const completeApi = readFileSync('app/api/garage/avveckla/complete/route.ts', 'utf8');
const transportApi = readFileSync('app/api/garage/avveckla/transport/route.ts', 'utf8');

test('datetime-local values are interpreted as Europe/Stockholm, not server UTC', () => {
  assert.equal(parseOperationalDateTime('2026-09-03T13:09'), '2026-09-03T11:09:00.000Z');
  assert.equal(parseOperationalDateTime('2026-01-15T13:09'), '2026-01-15T12:09:00.000Z');
});

test('explicit UTC/offset timestamps preserve their instant', () => {
  assert.equal(parseOperationalDateTime('2026-09-03T11:09:00Z'), '2026-09-03T11:09:00.000Z');
  assert.equal(parseOperationalDateTime('2026-09-03T13:09:00+02:00'), '2026-09-03T11:09:00.000Z');
});

test('Garage terminal and transport APIs share the Stockholm parser and reject future operational facts', () => {
  assert.match(completeApi, /parseOperationalDateTime\(body\.occurred_at\)/);
  assert.match(transportApi, /parseOperationalDateTime\(body\.booked_at\)/);
  assert.match(completeApi, /kan inte ligga i framtiden/);
  assert.match(transportApi, /kan inte ligga i framtiden/);
  assert.doesNotMatch(completeApi, /new Date\(candidate\)/);
  assert.doesNotMatch(transportApi, /new Date\(candidate\)/);
});
