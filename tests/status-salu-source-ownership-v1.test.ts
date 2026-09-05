import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const statusDataRoute = readFileSync('app/api/status-data/route.ts', 'utf8');
const vehicleEditsRoute = readFileSync('app/api/vehicle-edits/route.ts', 'utf8');
const migration = readFileSync(
  'migrations/20260906000500_lock_status_salu_source_ownership_v1.sql',
  'utf8',
);

test('Status reads current Saludatum from the SALU source-owned state', () => {
  assert.match(statusDataRoute, /from\('salu_vehicle_state'\)/);
  assert.match(statusDataRoute, /select\('regnr,current_saludatum,updated_at'\)/);
  assert.match(statusDataRoute, /saludatum: saluState\?\.current_saludatum \?\? nybilResponse\.data\.saludatum/);
  assert.match(statusDataRoute, /saludatum_source: saluState\?\.current_saludatum \? 'SALU' : 'NYBIL'/);
});

test('Status API refuses parallel edits of SALU-owned fields', () => {
  for (const field of [
    'saludatum',
    'salu_station',
    'salu_kopare',
    'salu_returadress',
    'salu_retur',
    'salu_attention',
    'salu_notering',
  ]) {
    assert.match(vehicleEditsRoute, new RegExp(`['\"]${field}['\"]`));
  }
  assert.match(vehicleEditsRoute, /SALU-owned fields must be changed in SALU/);
  assert.match(vehicleEditsRoute, /status: 409/);
});

test('database boundary blocks new STATUS-owned SALU process facts', () => {
  assert.match(migration, /guard_vehicle_edits_salu_source_ownership/);
  assert.match(migration, /before insert on public\.vehicle_edits/i);
  assert.match(migration, /SALU-owned field % must be changed in SALU, not STATUS/);
  assert.doesNotMatch(migration, /update public\.vehicle_edits/i);
  assert.doesNotMatch(migration, /delete from public\.vehicle_edits/i);
});

test('SÅLD remains separate and is not blocked by the SALU ownership gate', () => {
  assert.doesNotMatch(migration, /'is_sold'/);
  assert.doesNotMatch(migration, /'sold_datum'/);
  assert.doesNotMatch(migration, /'sold_kommentar'/);
});
