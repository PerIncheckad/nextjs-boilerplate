import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260903210000_add_legacy_current_state_entry_v1.sql', 'utf8');
const api = readFileSync('app/api/vehicle-journey/legacy-entry/route.ts', 'utf8');
const operational = readFileSync('app/api/vehicle-journey/operational-state/route.ts', 'utf8');
const garagePage = readFileSync('app/garage/page.tsx', 'utf8');
const garagePanel = readFileSync('app/garage/garage-legacy-entry-panel.tsx', 'utf8');
const reconciliation = readFileSync('migrations/20260903104500_add_current_state_reconciliation_v1.sql', 'utf8');
const avveckla = readFileSync('migrations/20260902230000_add_garage_avveckla_foundation_v1.sql', 'utf8');

test('LEGACY provenance is immutable and historical backfill is structurally false', () => {
  assert.match(migration, /vehicle_legacy_current_state_entries/);
  assert.match(migration, /object_type\s+text\s+not null check \(object_type = 'LEGACY_FLEET'\)/);
  assert.match(migration, /historical_backfill boolean not null default false check \(historical_backfill = false\)/);
  assert.match(migration, /reject_vehicle_legacy_current_state_entry_mutation/);
  assert.match(migration, /before update on public\.vehicle_legacy_current_state_entries/);
  assert.match(migration, /before delete on public\.vehicle_legacy_current_state_entries/);
});

test('DB generates verification time and starts Layer 1 exactly there', () => {
  assert.match(migration, /v_verified_at timestamptz := clock_timestamp\(\)/);
  assert.match(migration, /public\.transition_vehicle_journey_state\(/);
  assert.match(migration, /v_verified_at,/);
  assert.match(migration, /'historicalCoverageStartsAt', v_verified_at/);
  assert.match(migration, /'historicalBackfill', false/);
});

test('LEGACY v1 cannot manufacture RENTAL, SALU or OTHER', () => {
  assert.match(migration, /v_current_state not in \('AVAILABLE', 'PREPARATION', 'DOWNTIME'\)/);
  assert.doesNotMatch(garagePanel, /option value="RENTAL"/);
  assert.doesNotMatch(garagePanel, /option value="SALU"/);
  assert.doesNotMatch(garagePanel, /option value="OTHER">OTHER<\/option>/);
});

test('DOWNTIME requires a structured reason and OTHER requires comment', () => {
  assert.match(migration, /DOWNTIME requires a valid reason/);
  assert.match(migration, /Other downtime requires a comment/);
  assert.match(garagePanel, /DOWNTIME kräver orsak/);
  assert.match(garagePanel, /Övrig DOWNTIME kräver kommentar/);
});

test('existing closed Layer 1 history is preserved while current or future truth blocks entry', () => {
  assert.match(migration, /ended_at is null/);
  assert.match(migration, /Existing Layer 1 chronology extends beyond LEGACY verification time/);
  assert.doesNotMatch(migration, /update public\.vehicle_journey_periods\s+set/i);
  assert.doesNotMatch(migration, /delete from public\.vehicle_journey_periods/i);
});

test('normalized vehicle identity prevents parallel open states', () => {
  assert.ok(migration.includes("upper(regexp_replace(regnr, '\\s+', '', 'g'))"));
  assert.match(migration, /vehicle_journey_periods_one_open_normalized_state_uidx/);
  assert.match(migration, /Normalized duplicate open vehicle journey periods exist; migration will not rewrite history/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('vehicle-legacy-current-state:' \|\| v_regnr\)\)/);
});

test('concurrent current-state appearance aborts atomically instead of being closed by LEGACY', () => {
  assert.match(migration, /previousPeriodId/);
  assert.match(migration, /A current Layer 1 state appeared during LEGACY verification; entry aborted/);
});

test('API derives actor and identity snapshot server-side and rejects protected client fields', () => {
  assert.match(api, /verifyApiUser\(request\)/);
  assert.match(api, /p_actor_id: verification\.user\.id/);
  assert.match(api, /p_actor_email: verification\.user\.email/);
  assert.match(api, /vehicleCatalogIsOwnershipProof: false/);
  assert.match(api, /PROTECTED_FIELDS/);
  assert.match(api, /Field \$\{protectedField\} is server-controlled/);
  assert.doesNotMatch(api, /p_verified_at/);
});

test('LEGACY path does not write vehicle catalog, Nybil, Garage or SALU', () => {
  for (const source of [api, migration]) {
    assert.doesNotMatch(source, /from\('nybil_inventering'\).*\.(insert|update|delete)/s);
    assert.doesNotMatch(source, /from\('garage_items'\).*\.(insert|update|delete)/s);
    assert.doesNotMatch(source, /from\('salu_flags'\).*\.(insert|update|delete)/s);
    assert.doesNotMatch(source, /from\('vehicles'\).*\.(insert|update|delete)/s);
  }
  assert.doesNotMatch(migration, /insert into public\.nybil_inventering/);
  assert.doesNotMatch(migration, /insert into public\.garage_items/);
  assert.doesNotMatch(migration, /insert into public\.salu_flags/);
  assert.doesNotMatch(migration, /insert into public\.vehicles/);
});

test('operational state reads object type from immutable LEGACY source', () => {
  assert.match(operational, /vehicle_legacy_current_state_entries/);
  assert.match(operational, /objectType: 'LEGACY_FLEET'/);
  assert.match(operational, /objectTypeSource: 'LEGACY_CURRENT_STATE_ENTRY'/);
  assert.match(operational, /objectTypeSourceRecordId: legacy\.entry_id/);
});

test('Garage exposes separate explicit LEGACY surface without creating Garage object', () => {
  assert.match(garagePage, /GarageLegacyEntryPanel/);
  assert.match(garagePage, /02B \/ BEFINTLIG EGEN BIL \/ LEGACY/);
  assert.match(garagePanel, /Jag verifierar att detta är en befintlig egen flottabil/);
  assert.match(garagePanel, /Ingen historik bakåt skapas/);
  assert.doesNotMatch(garagePanel, /\/api\/garage\?/);
  assert.doesNotMatch(garagePanel, /garage_item_id/);
});

test('#542 Nybil reconciliation and AVVECKLA foundation remain untouched by LEGACY migration', () => {
  assert.match(reconciliation, /reconcile_missing_vehicle_journey_state_from_nybil/);
  assert.match(avveckla, /assert_garage_avveckla_ready_for_completion/);
  assert.doesNotMatch(migration, /reconcile_missing_vehicle_journey_state_from_nybil/);
  assert.doesNotMatch(migration, /assert_garage_avveckla_ready_for_completion/);
});
