import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assessCheckpointReadiness,
  validateCheckpointAssessment,
  validateCheckpointCode,
} from '../lib/checkpoint-engine';

const foundation = readFileSync(
  join(process.cwd(), 'migrations/20260821004000_create_checkpoint_engine_foundation.sql'),
  'utf8',
);
const instanceRpc = readFileSync(
  join(process.cwd(), 'migrations/20260821004500_add_checkpoint_instance_rpc.sql'),
  'utf8',
);
const api = readFileSync(
  join(process.cwd(), 'app/api/vehicle-checkpoints/route.ts'),
  'utf8',
);

test('checkpoint codes are normalized and reject unsafe values', () => {
  assert.equal(validateCheckpointCode(' salu_return_01 '), 'SALU_RETURN_01');
  assert.throws(() => validateCheckpointCode('x'), /Invalid checkpoint code/);
  assert.throws(() => validateCheckpointCode('bad code'), /Invalid checkpoint code/);
});

test('deviations require comment and evidence-required approval requires evidence', () => {
  assert.throws(
    () => validateCheckpointAssessment({ status: 'AVVIKELSE' }, 'MANUELL'),
    /Deviation requires a comment/,
  );
  assert.throws(
    () => validateCheckpointAssessment({ status: 'GODKAND', evidenceRefs: [] }, 'EVIDENCE_REQUIRED'),
    /Approved checkpoint requires evidence/,
  );
  assert.doesNotThrow(() => validateCheckpointAssessment(
    { status: 'GODKAND', evidenceRefs: ['document:123'] },
    'EVIDENCE_REQUIRED',
  ));
});

test('blocking readiness treats waiting and deviation as unresolved', () => {
  assert.deepEqual(
    assessCheckpointReadiness([
      { status: 'VANTAR', blocking: true },
      { status: 'GODKAND', blocking: true },
    ]),
    { ready: false, reasons: ['BLOCKING_CHECKPOINT_VANTAR'] },
  );
  assert.deepEqual(
    assessCheckpointReadiness([{ status: 'AVVIKELSE', blocking: true }]),
    { ready: false, reasons: ['BLOCKING_CHECKPOINT_AVVIKELSE'] },
  );
  assert.deepEqual(
    assessCheckpointReadiness([{ status: 'AVVIKELSE', blocking: false }]),
    { ready: true, reasons: [] },
  );
});

test('checkpoint persistence is versioned, server-only and keeps assessment history append-only', () => {
  assert.match(foundation, /primary key \(checkpoint_code, definition_version\)/i);
  assert.match(foundation, /unique \(regnr, checkpoint_code, cycle_key\)/i);
  assert.match(foundation, /checkpoint_assessments is append-only/i);
  assert.match(foundation, /before update on public\.checkpoint_assessments/i);
  assert.match(foundation, /before delete on public\.checkpoint_assessments/i);
  assert.match(foundation, /enable row level security/i);
  assert.match(foundation, /revoke all on public\.checkpoint_definitions from public, anon, authenticated/i);
  assert.match(foundation, /revoke all on public\.vehicle_checkpoints from public, anon, authenticated/i);
  assert.match(foundation, /revoke all on public\.checkpoint_assessments from public, anon, authenticated/i);
});

test('checkpoint assessment is atomic with current projection and journey event', () => {
  assert.match(foundation, /function public\.assess_vehicle_checkpoint/i);
  assert.match(foundation, /for update/i);
  assert.match(foundation, /insert into public\.checkpoint_assessments/i);
  assert.match(foundation, /update public\.vehicle_checkpoints/i);
  assert.match(foundation, /insert into public\.vehicle_journey_events/i);
  assert.match(foundation, /'CHECKPOINT_ASSESSED'/);
  assert.match(foundation, /to service_role/i);
});

test('checkpoint materialization is idempotent and appends creation to the vehicle journey', () => {
  assert.match(instanceRpc, /function public\.ensure_vehicle_checkpoint/i);
  assert.match(instanceRpc, /where checkpoint_code = upper\(trim\(p_checkpoint_code\)\)[\s\S]*and active/i);
  assert.match(instanceRpc, /insert into public\.vehicle_checkpoints/i);
  assert.match(instanceRpc, /'CHECKPOINT_CREATED'/);
  assert.match(instanceRpc, /to service_role/i);
});

test('checkpoint API is authenticated and delegates writes to server-only RPCs', () => {
  assert.match(api, /verifyApiUser\(request\)/);
  assert.match(api, /vehicleExists/);
  assert.match(api, /rpc\('ensure_vehicle_checkpoint'/);
  assert.match(api, /rpc\('assess_vehicle_checkpoint'/);
  assert.match(api, /Checkpoint not found for vehicle/);
  assert.match(api, /Deviation requires a comment/);
});
