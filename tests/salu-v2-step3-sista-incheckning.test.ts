import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('migrations/20260915233000_salu_v2_step3_sista_incheckning.sql', 'utf8');
const hardening = fs.readFileSync('migrations/20260915233100_salu_v2_step3_exact_binding_hardening.sql', 'utf8');
const checkRead = fs.readFileSync('app/api/check/salu-final/route.ts', 'utf8');
const checkArm = fs.readFileSync('app/api/check/salu-final/arm/route.ts', 'utf8');
const checkShell = fs.readFileSync('app/check/check-step3-shell.tsx', 'utf8');
const garageRead = fs.readFileSync('app/api/garage/sista-incheckning/route.ts', 'utf8');
const garagePanel = fs.readFileSync('app/garage/garage-sista-incheckning-panel.tsx', 'utf8');

test('Step 3 freezes exact source identities and future downtime anchor', () => {
  for (const column of [
    'garage_item_id', 'salu_plan_id', 'source_salu_flag_id', 'decision_id',
    'decision_version', 'checkin_id', 'regnr', 'final_checkin_completed_at',
    'checkin_completed_by', 'verification_intent_id',
  ]) assert.match(migration, new RegExp(`\\b${column}\\b`));
  assert.match(migration, /unique \(garage_item_id\)/);
  assert.match(migration, /unique \(decision_id\)/);
  assert.match(migration, /unique \(checkin_id\)/);
});

test('binding requires exact authenticated intent and current decision version', () => {
  assert.match(hardening, /i\.auth_user_id = new\.completed_by/);
  assert.match(hardening, /i\.decision_id/);
  assert.match(hardening, /d\.decision_version = i\.decision_version/);
  assert.match(hardening, /not exists \([\s\S]*newer\.decision_version > d\.decision_version/);
  assert.match(hardening, /regnr is validation only, never chain selection/i);
  assert.doesNotMatch(hardening, /latest checkin wins/i);
});

test('completed Check-in timing cannot precede SISTA HYRAN decision', () => {
  assert.match(hardening, /new\.completed_at < v_decision\.decided_at/);
  assert.match(hardening, /CHECKIN_BEFORE_SISTA_HYRAN_DECISION/);
});

test('later completed Check-in becomes conflict and cannot overwrite final lock', () => {
  assert.match(hardening, /LATER_COMPLETED_CHECKIN_AFTER_LOCK/);
  assert.match(migration, /garage_sista_incheckning_conflicts/);
  assert.match(migration, /SISTA INCHECKNING history is append-only/);
});

test('new SISTA HYRAN version is rejected after verified final Check-in', () => {
  assert.match(migration, /before insert on public\.garage_sista_hyran_decisions/);
  assert.match(migration, /Ny SISTA HYRAN-version är låst efter verifierad SISTA INCHECKNING/);
});

test('Check-in UI is read-only context over source-owned SALU and Garage facts', () => {
  assert.match(checkShell, /SISTA HYRAN – BILEN SKA VIDARE TILL SALU/);
  assert.match(checkShell, /PLANERAT SALU-DATUM/);
  assert.match(checkShell, /GARAGE SLUTLIG TIMING/);
  assert.match(checkShell, /DESTINATION/);
  assert.match(checkShell, /TRANSPORT/);
  assert.match(checkShell, /VERKSTAD \/ REPARATION/);
  assert.match(checkShell, /GARAGE OPERATIV KOMMENTAR/);
  assert.match(checkShell, /BESLUTSANTECKNING/);
  assert.match(checkRead, /from\('salu_plans'\)/);
  assert.match(checkRead, /from\('garage_sista_hyran_current'\)/);
  assert.match(checkArm, /arm_garage_sista_incheckning_intent_v1/);
});

test('Step 3 does not create a parallel damage or Check-in write path', () => {
  assert.doesNotMatch(checkRead, /from\('damages'\)\.insert/);
  assert.doesNotMatch(checkArm, /from\('checkins'\)\.insert/);
  assert.doesNotMatch(checkShell, /nya_skador|checkin_damages/);
  assert.match(migration, /completed Check-in remains source-owned by public\.checkins/);
});

test('Garage reads exact final Check-in while remaining an open operational object', () => {
  assert.match(garageRead, /from\('garage_sista_incheckning_current'\)/);
  assert.match(garageRead, /from\('checkins'\)/);
  assert.match(garageRead, /garage_sista_incheckning_conflicts/);
  assert.match(garagePanel, /ÖPPEN FÖR FÄRDIGSTÄLLANDE/);
  assert.match(garagePanel, /Senare completed Check-in har registrerats som exception/);
});

test('Step 3 scope contains no terminal lifecycle implementation', () => {
  const runtime = [migration, hardening, checkRead, checkArm, checkShell, garageRead, garagePanel].join('\n');
  assert.doesNotMatch(runtime, /canonical_fleet_membership.*EXIT|membership_status.*EXIT/i);
  assert.doesNotMatch(runtime, /update[\s\S]{0,100}vehicles[\s\S]{0,100}INACTIVE/i);
  assert.doesNotMatch(runtime, /from\('garage_avveckla_cases'\).*insert/i);
  assert.doesNotMatch(runtime, /from\('salu_plans'\).*update/i);
});
