import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const handoffApi = readFileSync('app/api/garage/nybil-handoff/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-v2-panel.tsx', 'utf8');
const picker = readFileSync('app/nybil/garage-picker.tsx', 'utf8');

test('Garage Ny bil list checks existing Ny bil truth by regnr', () => {
  assert.match(handoffApi, /from\('nybil_inventering'\)/);
  assert.match(handoffApi, /existing_nybil_id/);
  assert.match(handoffApi, /source_garage_item_id/);
  assert.match(handoffApi, /regKey/);
});

test('single handoff is blocked when regnr already exists in Ny bil', () => {
  assert.match(handoffApi, /Registreringsnumret finns redan i Ny bil och ska inte registreras igen/);
  assert.match(handoffApi, /existing_nybil_created_at/);
  assert.match(handoffApi, /status: 409/);
});

test('Garage shows waiting, historically known and atomically received cars while Ny bil owns the fetch action', () => {
  assert.match(panel, /Väntar på Ny bil/);
  assert.match(panel, /Redan i Ny bil/);
  assert.match(panel, /Mottagen i Ny bil/);
  assert.match(panel, /alreadyKnown/);
  assert.match(panel, /existing_nybil_id/);
  assert.doesNotMatch(panel, /Till Ny bil/);
  assert.doesNotMatch(panel, /\/nybil\?garage_item_id=/);
  assert.match(picker, /Hämta bilen från Garaget/);
  assert.match(picker, />Hämta</);
  assert.match(picker, /\/nybil\?garage_item_id=/);
});

test('guard does not backfill or rewrite historical Ny bil or Garage rows', () => {
  assert.doesNotMatch(handoffApi, /\.update\(/);
  assert.doesNotMatch(handoffApi, /\.insert\(/);
  assert.doesNotMatch(handoffApi, /\.delete\(/);
});
