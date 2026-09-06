import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const handoffApi = readFileSync('app/api/garage/nybil-handoff/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-nybil-handoff-status-panel.tsx', 'utf8');
const picker = readFileSync('app/nybil/garage-picker.tsx', 'utf8');
const garagePage = readFileSync('app/garage/page.tsx', 'utf8');

test('Garage Nybil list checks existing Nybil truth by regnr', () => {
  assert.match(handoffApi, /from\('nybil_inventering'\)/);
  assert.match(handoffApi, /existing_nybil_id/);
  assert.match(handoffApi, /source_garage_item_id/);
  assert.match(handoffApi, /regKey/);
});

test('single handoff is blocked when regnr already exists in Nybil', () => {
  assert.match(handoffApi, /Registreringsnumret finns redan i Ny bil och ska inte registreras igen/);
  assert.match(handoffApi, /existing_nybil_created_at/);
  assert.match(handoffApi, /status: 409/);
});

test('Garage is read-only handoff status while Nybil owns the fetch action', () => {
  assert.match(panel, /VÄNTAR PÅ NYBIL/);
  assert.match(panel, /MOTTAGEN I NYBIL/);
  assert.match(panel, /Historisk Nybil före Garage/);
  assert.match(panel, /Nybil efter Garage · koppling saknas/);
  assert.match(panel, /Read-only/);
  assert.match(panel, /Ingen Nybil-exekvering sker här/);
  assert.doesNotMatch(panel, /method:\s*['\"](?:POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(panel, /\/nybil\?garage_item_id=/);
  assert.match(picker, /Hämta bilen från Garaget/);
  assert.match(picker, />Hämta</);
  assert.match(picker, /\/nybil\?garage_item_id=/);
  assert.match(garagePage, /GarageNybilHandoffStatusPanel/);
  assert.doesNotMatch(garagePage, /GarageV2Panel/);
});

test('existing Nybil overlap is classified by chronology without claiming a handshake', () => {
  assert.match(handoffApi, /classifyExistingNybilTiming/);
  assert.match(handoffApi, /BEFORE_GARAGE/);
  assert.match(handoffApi, /AFTER_GARAGE/);
  assert.match(handoffApi, /existing_nybil_timing/);
});

test('guard does not backfill or rewrite historical Nybil or Garage rows', () => {
  assert.doesNotMatch(handoffApi, /\.update\(/);
  assert.doesNotMatch(handoffApi, /\.insert\(/);
  assert.doesNotMatch(handoffApi, /\.delete\(/);
});
