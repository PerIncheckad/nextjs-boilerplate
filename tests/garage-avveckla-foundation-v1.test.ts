import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260902230000_add_garage_avveckla_foundation_v1.sql', 'utf8');
const api = readFileSync('app/api/garage/avveckla/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-avveckla-panel.tsx', 'utf8');
const page = readFileSync('app/garage/page.tsx', 'utf8');

test('AVVECKLA has a dedicated case, point and append-only event contract', () => {
  assert.match(migration, /create table public\.garage_avveckla_cases/i);
  assert.match(migration, /create table public\.garage_avveckla_points/i);
  assert.match(migration, /create table public\.garage_avveckla_events/i);
  assert.match(migration, /garage_avveckla_events_append_only_update/i);
  assert.match(migration, /garage_avveckla_events_append_only_delete/i);
});

test('AVVECKLA starts manually on an exact UT Garage episode with a reason', () => {
  assert.match(migration, /start_garage_avveckla_case/i);
  assert.match(migration, /garage_direction <> 'UT'/i);
  assert.match(migration, /Orsak krävs/i);
  assert.match(api, /action === 'START_CASE'/);
  assert.match(panel, /Starta AVVECKLA/);
  assert.match(panel, /Orsak/);
});

test('AVVECKLA points are explicit OPEN to CLOSED work with structured outcome', () => {
  assert.match(migration, /status text not null default 'OPEN'/i);
  assert.match(migration, /check \(status in \('OPEN', 'CLOSED'\)\)/i);
  assert.match(migration, /outcome_code text/i);
  assert.match(migration, /point_kind in \('STANDARD', 'OVRIGT'\)/i);
  assert.match(api, /action === 'ADD_POINT'/);
  assert.match(api, /action === 'CLOSE_POINT'/);
  assert.match(panel, /KLAR \/ AVSLUTAD/);
  assert.match(panel, /Kompletterande text, frivillig/);
  assert.match(panel, /Övrigt/);
});

test('terminal UT is gated on every AVVECKLA point being closed', () => {
  assert.match(migration, /assert_garage_avveckla_ready_for_completion/i);
  assert.match(migration, /status = 'OPEN'/i);
  assert.match(migration, /UT kan inte verifieras/);
  assert.match(panel, /Alla öppna punkter måste avslutas innan en senare verifierad UT-händelse får genomföras/);
});

test('successful Garage completion is separate from voiding and becomes frozen', () => {
  assert.match(migration, /add column if not exists completed_at/i);
  assert.match(migration, /add column if not exists completed_by/i);
  assert.match(migration, /add column if not exists completion_event_id/i);
  assert.match(migration, /guard_completed_garage_item/i);
  assert.doesNotMatch(migration, /set voided_at =/i);
});

test('A reserves exact terminal event identities without implementing B terminal RPCs', () => {
  for (const event of ['UT_OVERLAMNING_VERIFIERAD', 'UT_TRANSPORTOR_HAMTAT_VERIFIERAD', 'UT_AVSTALLNING_VERIFIERAD']) {
    assert.match(migration, new RegExp(event));
  }
  assert.doesNotMatch(api, /VERIFY_UT|COMPLETE_CASE|OVERLAMNING_VERIFIERAD|TRANSPORTOR_HAMTAT_VERIFIERAD|AVSTALLNING_VERIFIERAD/);
});

test('Garage page exposes the AVVECKLA work process before existing order workflow', () => {
  assert.match(page, /import GarageAvvecklaPanel/);
  assert.match(page, /<GarageAvvecklaPanel \/>[\s\S]*<OrderWorkflowPanel \/>/);
});
