import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const statusDataRoute = readFileSync('app/api/status-data/route.ts', 'utf8');
const vehicleEditsRoute = readFileSync('app/api/vehicle-edits/route.ts', 'utf8');
const vehicleStatus = readFileSync('lib/vehicle-status.ts', 'utf8');
const statusForm = readFileSync('app/status/form-client.tsx', 'utf8');
const originalMigration = readFileSync(
  'migrations/20260906000500_lock_status_salu_source_ownership_v1.sql',
  'utf8',
);
const narrowedMigration = readFileSync(
  'migrations/20260906014500_narrow_status_salu_source_ownership_v1.sql',
  'utf8',
);

const statusOwnedContractFields = [
  'salu_station',
  'salu_kopare',
  'salu_returadress',
  'salu_retur',
  'salu_attention',
  'salu_notering',
];

test('Status reads current Saludatum from the SALU source-owned state', () => {
  assert.match(statusDataRoute, /from\('salu_vehicle_state'\)/);
  assert.match(statusDataRoute, /select\('regnr,current_saludatum,updated_at'\)/);
  assert.match(statusDataRoute, /saludatum: saluState\?\.current_saludatum \?\? nybilResponse\.data\.saludatum/);
  assert.match(statusDataRoute, /saludatum_source: saluState\?\.current_saludatum \? 'SALU' : 'NYBIL'/);
});

test('Status API blocks only Saludatum as SALU-owned process data', () => {
  const ownedSet = vehicleEditsRoute.match(/const SALU_OWNED_FIELDS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(ownedSet);
  assert.match(ownedSet[1], /'saludatum'/);
  for (const field of statusOwnedContractFields) {
    assert.doesNotMatch(ownedSet[1], new RegExp(`['\"]${field}['\"]`));
  }
  assert.match(vehicleEditsRoute, /SALU-owned fields must be changed in SALU/);
  assert.match(vehicleEditsRoute, /status: 409/);
});

test('database boundary narrows the SALU ownership guard to Saludatum without rewriting history', () => {
  assert.match(originalMigration, /guard_vehicle_edits_salu_source_ownership/);
  assert.match(narrowedMigration, /create or replace function public\.guard_vehicle_edits_salu_source_ownership/);
  assert.match(narrowedMigration, /new\.field_name = 'saludatum'/);
  for (const field of statusOwnedContractFields) {
    assert.doesNotMatch(narrowedMigration, new RegExp(`new\\.field_name\\s*=\\s*['\"]${field}['\"]`));
  }
  assert.doesNotMatch(narrowedMigration, /update public\.vehicle_edits/i);
  assert.doesNotMatch(narrowedMigration, /delete from public\.vehicle_edits/i);
});

test('current contract facts resolve Status edit first and Nybil baseline second', () => {
  assert.match(vehicleStatus, /saluStation: latestEdits\.get\('salu_station'\)\?\.value \|\| nybilData\?\.salu_station \|\| '---'/);
  assert.match(vehicleStatus, /saluKopare: latestEdits\.get\('salu_kopare'\)\?\.value \|\| nybilData\?\.kopare_foretag \|\| '---'/);
  assert.match(vehicleStatus, /saluRetur: latestEdits\.get\('salu_retur'\)\?\.value \|\| nybilData\?\.returort \|\| '---'/);
  assert.match(vehicleStatus, /saluReturadress: latestEdits\.get\('salu_returadress'\)\?\.value \|\| nybilData\?\.returadress \|\| '---'/);
  assert.match(vehicleStatus, /saluAttention: latestEdits\.get\('salu_attention'\)\?\.value \|\| nybilData\?\.attention \|\| '---'/);
  assert.match(vehicleStatus, /saluNotering: latestEdits\.get\('salu_notering'\)\?\.value \|\| nybilData\?\.notering_forsaljning \|\| '---'/);
});


test('Status UI keeps Saludatum read-only while the six contract facts remain editable', () => {
  assert.doesNotMatch(statusForm, /fieldName=["']saludatum["']/);
  assert.match(statusForm, /<InfoRow label=["']Saludatum["']/);
  for (const field of statusOwnedContractFields) {
    assert.match(statusForm, new RegExp(`fieldName=["']${field}["']`));
  }
});

test('SÅLD remains separate and is not blocked by the SALU ownership gate', () => {
  assert.doesNotMatch(narrowedMigration, /'is_sold'/);
  assert.doesNotMatch(narrowedMigration, /'sold_datum'/);
  assert.doesNotMatch(narrowedMigration, /'sold_kommentar'/);
});
