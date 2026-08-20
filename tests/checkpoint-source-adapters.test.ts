import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

const definitions = readFileSync(
  join(process.cwd(), 'migrations/20260820225411_seed_checkpoint_source_definitions_v1.sql'),
  'utf8',
);
const adapter = readFileSync(
  join(process.cwd(), 'migrations/20260820225623_add_verified_checkpoint_source_adapter_v1.sql'),
  'utf8',
);
const syncMigration = readFileSync(
  join(process.cwd(), 'migrations/20260820230052_sync_and_harden_checkpoint_sources_v1.sql'),
  'utf8',
);
const syncApi = readFileSync(
  join(process.cwd(), 'app/api/vehicle-checkpoints/sync/route.ts'),
  'utf8',
);

test('first source definitions are narrow versioned facts and do not duplicate SALU checkpoints', () => {
  for (const checkpointCode of [
    'NYBIL_BASELINE_CAPTURED',
    'CHECKIN_COMPLETED',
    'SALU_CYCLE_CREATED',
  ]) {
    assert.match(definitions, new RegExp(`'${checkpointCode}'`));
  }

  assert.match(definitions, /'NYBIL'[\s\S]*'CHECKIN'[\s\S]*'SALU'/);
  assert.match(definitions, /'SYSTEM'/);
  assert.match(definitions, /on conflict \(checkpoint_code, definition_version\) do nothing/i);
  assert.doesNotMatch(definitions, /insert into public\.vehicle_checkpoints/i);
  assert.doesNotMatch(definitions, /insert into public\.salu_checkpoints/i);
});

test('verified source adapter is atomic, idempotent and only accepts SYSTEM definitions', () => {
  assert.match(adapter, /function public\.record_verified_source_checkpoint/i);
  assert.match(adapter, /verification_mode <> 'SYSTEM'/i);
  assert.match(adapter, /for update/i);
  assert.match(adapter, /insert into public\.vehicle_checkpoints/i);
  assert.match(adapter, /insert into public\.checkpoint_assessments/i);
  assert.match(adapter, /'CHECKPOINT_CREATED'/);
  assert.match(adapter, /'CHECKPOINT_ASSESSED'/);
  assert.match(adapter, /actor_source[\s\S]*'SYSTEM'/i);
  assert.match(adapter, /to service_role/i);
});

test('database blocks manual assessment of SYSTEM checkpoints and preserves evidence rules', () => {
  assert.match(syncMigration, /function public\.enforce_checkpoint_assessment_verification_mode/i);
  assert.match(syncMigration, /System checkpoint can only be assessed by a system source/);
  assert.match(syncMigration, /before insert on public\.checkpoint_assessments/i);
  assert.match(syncMigration, /Approved checkpoint requires evidence/);
  assert.match(syncMigration, /from public, anon, authenticated/i);
  assert.match(syncMigration, /to service_role/i);
});

test('vehicle source synchronization uses only concrete Nybil, completed Check-in and SALU records', () => {
  assert.match(syncMigration, /function public\.sync_vehicle_source_checkpoints/i);
  assert.match(syncMigration, /from public\.nybil_inventering/i);
  assert.match(syncMigration, /from public\.checkins/i);
  assert.match(syncMigration, /status = 'COMPLETED'/i);
  assert.match(syncMigration, /completed_at is not null/i);
  assert.match(syncMigration, /from public\.salu_flags/i);
  assert.match(syncMigration, /'nybil:' \|\| v_row\.id::text/i);
  assert.match(syncMigration, /'checkin:' \|\| v_row\.id::text/i);
  assert.match(syncMigration, /'salu:' \|\| v_row\.flag_id::text/i);
  assert.match(syncMigration, /record_verified_source_checkpoint/g);
  assert.doesNotMatch(syncMigration, /insert into public\.salu_checkpoints/i);
});

test('source sync API is authenticated and delegates the whole vehicle sync to one server RPC', () => {
  assert.match(syncApi, /verifyApiUser\(request\)/);
  assert.match(syncApi, /vehicleExists/);
  assert.match(syncApi, /rpc\('sync_vehicle_source_checkpoints'/);
  assert.match(syncApi, /p_actor_id:\s*verification\.user\.id/);
  assert.match(syncApi, /p_actor_email:\s*verification\.user\.email/);
  assert.doesNotMatch(syncApi, /record_verified_source_checkpoint/);
});

test('checkpoint source synchronization stays behind the central API authentication boundary', async () => {
  const response = await proxy(new NextRequest(
    'http://localhost/api/vehicle-checkpoints/sync',
    { method: 'POST' },
  ));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
});
