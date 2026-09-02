import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('migrations/20260902233000_add_garage_avveckla_terminal_handoffs_v1.sql', 'utf8');
const foundation = readFileSync('migrations/20260902230000_add_garage_avveckla_foundation_v1.sql', 'utf8');
const completeApi = readFileSync('app/api/garage/avveckla/complete/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-avveckla-panel.tsx', 'utf8');
const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const overviewApi = readFileSync('app/api/garage/overview/route.ts', 'utf8');

test('Step B uses the locked AVVECKLA readiness gate instead of inventing a second gate', () => {
  assert.match(foundation, /function public\.assert_garage_avveckla_ready_for_completion/i);
  assert.match(migration, /public\.assert_garage_avveckla_ready_for_completion\(p_garage_item_id\)/);
  assert.doesNotMatch(migration, /from public\.garage_avveckla_points/i);
  assert.doesNotMatch(migration, /status\s*=\s*'OPEN'.*garage_avveckla_points/is);
});

test('Step B exposes exactly the three locked terminal UT handoffs', () => {
  assert.match(migration, /verify_garage_avveckla_egen_leverans/);
  assert.match(migration, /UT_OVERLAMNING_VERIFIERAD/);
  assert.match(migration, /verify_garage_avveckla_extern_transport/);
  assert.match(migration, /UT_TRANSPORTOR_HAMTAT_VERIFIERAD/);
  assert.match(migration, /verify_garage_avveckla_avstallning/);
  assert.match(migration, /UT_AVSTALLNING_VERIFIERAD/);
});

test('terminal UT requires evidence and real occurrence time and writes immutable source proof', () => {
  assert.match(migration, /Verklig tidpunkt för UT-händelsen krävs/);
  assert.match(migration, /Evidensreferens krävs för verifierat UT/);
  assert.match(migration, /insert into public\.garage_avveckla_events/i);
  assert.match(migration, /evidence_reference/);
  assert.match(migration, /:TERMINAL_UT/);
});

test('terminal UT closes exactly one current Layer 1 period with AVVECKLA provenance', () => {
  assert.match(migration, /close_vehicle_journey_period_from_source/);
  assert.match(migration, /ended_at is null/);
  assert.match(migration, /Flera öppna fordonsperioder finns för bilen; UT stoppas/);
  assert.match(migration, /Aktuell öppen fordonsperiod saknas; UT får inte fabricera Layer 1-historik/);
  assert.match(migration, /'PERIOD_ENDED'/);
  assert.match(migration, /'GARAGE_AVVECKLA'/);
  assert.match(migration, /'garage_avveckla_events'/);
  assert.doesNotMatch(migration, /transition_vehicle_journey_state/);
});

test('successful UT freezes exact Garage episode and removes it from active Garage reads', () => {
  assert.match(migration, /set status = 'COMPLETED'/);
  assert.match(migration, /set completed_at = p_occurred_at/);
  assert.match(migration, /completion_event_id = v_event_id/);
  assert.match(garageApi, /is\('completed_at', null\)/);
  assert.match(overviewApi, /is\('completed_at', null\)/);
  assert.match(garageApi, /Garage-objektet är verifierat UT och är fryst/);
});

test('server API maps each explicit method to its own terminal RPC', () => {
  assert.match(completeApi, /EGEN_LEVERANS:\s*'verify_garage_avveckla_egen_leverans'/);
  assert.match(completeApi, /EXTERN_TRANSPORT:\s*'verify_garage_avveckla_extern_transport'/);
  assert.match(completeApi, /AVSTALLNING:\s*'verify_garage_avveckla_avstallning'/);
  assert.match(completeApi, /verifyApiUser/);
  assert.match(completeApi, /evidence_reference/);
  assert.match(completeApi, /occurred_at/);
});

test('Garage UI only enables terminal verification when the A gate is visibly ready', () => {
  assert.match(panel, /Alla AVVECKLA-punkter är KLAR\/AVSLUTADE/);
  assert.match(panel, /disabled=\{busy \|\| !allClosed\}/);
  assert.match(panel, /Verifiera UT \/ AVSLUT/);
  assert.match(panel, /EGEN_LEVERANS/);
  assert.match(panel, /EXTERN_TRANSPORT/);
  assert.match(panel, /AVSTALLNING/);
});

test('Step B does not implement step C timers or step D billing', () => {
  assert.doesNotMatch(migration, /booked_at|5 dygn|five.day|checkpoint_action_timer_rules/i);
  assert.doesNotMatch(migration, /FAKTURERBAR_KÖRNING|billing_status|price_list|fakturaunderlag/i);
  assert.doesNotMatch(completeApi, /billing|faktur|price_list/i);
});
