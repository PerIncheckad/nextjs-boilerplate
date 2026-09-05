import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260905201500_hjulskifte_simple_flow_v1.sql', 'utf8');
const api = readFileSync('app/api/garage/wheel-changes/simple/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-wheel-change-panel.tsx', 'utf8');

test('normal Hjulskifte flow can complete directly from KRAVS or BOKAD without inventing PAGAENDE', () => {
  assert.match(migration, /v_change\.status = 'KRAVS'[\s\S]*'KLAR'/);
  assert.match(migration, /v_change\.status = 'BOKAD'[\s\S]*'KLAR'/);
  assert.match(migration, /elsif v_next_status = 'KLAR'[\s\S]*'GODKAND'/);
  assert.doesNotMatch(migration, /set status = 'PAGAENDE'/);
});

test('Boka creates and books atomically in one database transaction', () => {
  assert.match(migration, /function public\.book_garage_wheel_change_for_vehicle/);
  assert.match(migration, /create_garage_wheel_change_for_vehicle/);
  assert.match(migration, /update_garage_wheel_change\([\s\S]*'BOKAD'/);
  assert.match(api, /book_garage_wheel_change_for_vehicle/);
});

test('Redan utfört records explicit completion without a fabricated running state', () => {
  assert.match(migration, /function public\.complete_garage_wheel_change_for_vehicle/);
  assert.match(migration, /update_garage_wheel_change\([\s\S]*'KLAR'/);
  assert.match(panel, /Redan utfört \/ Klar/);
  assert.match(panel, /Klarmarkera/);
});

test('simple API preserves season, sold and wheel eligibility gates', () => {
  assert.match(api, /operational\.active/);
  assert.match(api, /soldRegnrs\.has\(regnr\)/);
  assert.match(api, /eligibility !== 'REQUIRES_CHANGE'/);
  assert.match(api, /Hjulskifte finns redan för bilen och säsongen/);
});

test('operator-facing normal flow is Boka then Klarmarkera', () => {
  assert.match(panel, /Normalflöde: <strong>Boka → Klarmarkera\.<\/strong>/);
  assert.doesNotMatch(panel, /<select value=\{draft\.status\}/);
});
