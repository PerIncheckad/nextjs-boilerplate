import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(
  join(process.cwd(), 'app/api/vehicle-journey/route.ts'),
  'utf8',
);

const foundationMigration = readFileSync(
  join(process.cwd(), 'migrations/20260820184925_create_vehicle_journey_foundation.sql'),
  'utf8',
);

const indexMigration = readFileSync(
  join(process.cwd(), 'migrations/20260820185009_index_vehicle_journey_foreign_keys.sql'),
  'utf8',
);

test('Vagnkort read model is authenticated and server-side', () => {
  assert.match(route, /verifyApiUser\(request\)/);
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(route, /persistSession: false/);
});

test('Vagnkort reads the vehicle journey without inventing business events', () => {
  assert.match(route, /from\('vehicle_journey_events'\)/);
  assert.match(route, /from\('vehicle_journey_periods'\)/);
  assert.match(route, /from\('vehicle_documents'\)/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.delete\(/);
});

test('Vagnkort composes existing Nybil, Check, damage, receipt and SALU sources', () => {
  for (const source of [
    'nybil_inventering',
    'vehicles',
    'checkins',
    'damages',
    'vehicle_receipts',
    'salu_vehicle_state',
    'salu_flags',
    'salu_checkpoints',
    'salu_child_processes',
  ]) {
    assert.match(route, new RegExp(`from\\('${source}'\\)`));
  }
});

test('legacy receipts remain visible through the unified Vagnkort document list', () => {
  assert.match(route, /sourceKind: 'legacy_receipt'/);
  assert.match(route, /storage_bucket: 'receipts'/);
  assert.match(route, /source_system: 'LEGACY_RECEIPTS'/);
});

test('journey foundation is server-only and events are append-only', () => {
  for (const table of [
    'vehicle_journey_events',
    'vehicle_journey_periods',
    'vehicle_documents',
  ]) {
    assert.match(foundationMigration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(foundationMigration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.match(foundationMigration, /vehicle_journey_events is append-only/i);
  assert.match(foundationMigration, /before update on public\.vehicle_journey_events/i);
  assert.match(foundationMigration, /before delete on public\.vehicle_journey_events/i);
});

test('journey foundation preserves history and evidence links', () => {
  assert.match(foundationMigration, /references public\.checkins\(id\) on delete restrict/i);
  assert.match(foundationMigration, /references public\.damages\(id\) on delete restrict/i);
  assert.match(foundationMigration, /references public\.salu_flags\(flag_id\) on delete restrict/i);
  assert.match(foundationMigration, /references public\.salu_checkpoints\(checkpoint_id\) on delete restrict/i);
  assert.match(foundationMigration, /references public\.salu_child_processes\(child_process_id\) on delete restrict/i);
});

test('all new foreign keys have deliberate supporting indexes', () => {
  assert.match(indexMigration, /vehicle_journey_events_correction_idx/);
  assert.match(indexMigration, /vehicle_journey_periods_source_event_idx/);
  assert.match(indexMigration, /vehicle_documents_salu_checkpoint_idx/);
  assert.match(indexMigration, /vehicle_documents_salu_child_process_idx/);
});
