import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260903002000_add_garage_avveckla_transport_timer_v1.sql', 'utf8');
const cron = readFileSync('migrations/20260903002100_enable_garage_avveckla_transport_timer_cron.sql', 'utf8');
const api = readFileSync('app/api/garage/avveckla/transport/route.ts', 'utf8');

test('TRANSPORT_BOKAD freezes the real booking time and exact five-day deadline', () => {
  assert.match(migration, /booked_at timestamptz not null/i);
  assert.match(migration, /deadline_at = booked_at \+ interval '5 days'/i);
  assert.match(migration, /event_type.*TRANSPORT_BOKAD/i);
  assert.match(migration, /Transportbokningens ursprung är fryst/i);
});

test('external pickup cannot be verified without the frozen transport booking', () => {
  assert.match(migration, /create or replace function public\.verify_garage_avveckla_extern_transport/i);
  assert.match(migration, /Extern transport kräver verifierad TRANSPORT_BOKAD/i);
  assert.match(migration, /p_occurred_at < v_booking\.booked_at/i);
  assert.match(migration, /complete_garage_avveckla_ut_internal/i);
});

test('five-day timer creates explicit AVVIKELSE and LARM state without closing AVVECKLA', () => {
  assert.match(migration, /run_garage_avveckla_transport_timers/i);
  assert.match(migration, /picked_up_at is null/i);
  assert.match(migration, /deadline_at <= v_now/i);
  assert.match(migration, /deviation_at = v_row\.deadline_at/i);
  assert.match(migration, /alert_at = v_row\.deadline_at/i);
  assert.match(migration, /TRANSPORT_5_DYGN_OVERSKRIDET/i);
  assert.doesNotMatch(migration, /set status = 'COMPLETED'[\s\S]*run_garage_avveckla_transport_timers/i);
});

test('timer follows existing hourly database-owned scheduler pattern', () => {
  assert.match(cron, /garage-avveckla-transport-timers-hourly/i);
  assert.match(cron, /0 \* \* \* \*/i);
  assert.match(cron, /run_garage_avveckla_transport_timers\(now\(\), true\)/i);
});

test('transport booking API uses authenticated actor and RPC, not direct client writes', () => {
  assert.match(api, /verifyApiUser/i);
  assert.match(api, /rpc\('book_garage_avveckla_transport'/i);
  assert.match(api, /verification\.user\.id/i);
  assert.doesNotMatch(api, /\.insert\(/i);
});
