import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assessSaluCloseReadiness } from '../lib/salu-process';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260824231000_fix_salu_final_assessment_acceptance_v2.sql'),
  'utf8',
);

test('SALU final assessment follows the source-owned readiness contract', () => {
  assert.deepEqual(
    assessSaluCloseReadiness({
      checkpointStatuses: ['GODKÄND', 'VÄNTAR', 'AVVIKELSE'],
      childStatuses: ['VERIFIED', 'CREATED'],
    }),
    {
      ready: false,
      reasons: ['CHECKPOINT_VÄNTAR', 'CHILD_PROCESS_NOT_TERMINAL'],
    },
  );

  assert.deepEqual(
    assessSaluCloseReadiness({
      checkpointStatuses: ['GODKÄND', 'EJ RELEVANT', 'AVVIKELSE'],
      childStatuses: ['VERIFIED', 'CANCELLED'],
    }),
    { ready: true, reasons: [] },
  );
});

test('migration versions SALU_FINAL_ASSESSMENT away from unconditional PLANERING/INKOP handoffs', () => {
  assert.match(migration, /SALU_FINAL_ASSESSMENT', 2/);
  assert.match(migration, /SALU_CHECKPOINT_SET/);
  assert.match(migration, /SALU_CHILD_PROCESS_SET/);
  assert.match(migration, /SALU_CHECKPOINTS_WAITING/);
  assert.match(migration, /SALU_CHILD_PROCESS_NOT_TERMINAL/);
  assert.match(migration, /status not in \('VERIFIED','CANCELLED'\)/i);
  assert.match(migration, /status = 'VÄNTAR'/i);
});

test('final assessment and manual closure re-assert readiness instead of mutating around the gate', () => {
  assert.match(migration, /function public\.move_salu_flag_to_final_assessment_v1/i);
  assert.match(migration, /function public\.close_salu_flag_manually_v1/i);
  assert.match(migration, /public\.assert_routine_passage_ready\(/i);
  assert.match(migration, /Manual closure requires SLUTBEDÖMNING/);
  assert.match(migration, /Remaining SALU deviations require accepted-deviation closure outcome/);
  assert.match(migration, /SALU_FLAG_CLOSED_MANUALLY/);
  assert.match(migration, /checkpointSnapshot/);
  assert.match(migration, /childProcessSnapshot/);
});

test('SALU workflow mutations are server-only and audited', () => {
  assert.match(migration, /function public\.acknowledge_salu_flag_v1/i);
  assert.match(migration, /function public\.record_salu_checkpoint_status_v1/i);
  assert.match(migration, /function public\.create_salu_child_process_v1/i);
  assert.match(migration, /function public\.transition_salu_child_process_v1/i);
  assert.match(migration, /SALU_FLAG_ACKNOWLEDGED/);
  assert.match(migration, /SALU_CHECKPOINT_CHANGED/);
  assert.match(migration, /SALU_CHILD_PROCESS_CREATED/);
  assert.match(migration, /SALU_CHILD_STATUS_REPORTED/);
  assert.match(migration, /revoke all on function public\.close_salu_flag_manually_v1\(uuid,text,text,uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.close_salu_flag_manually_v1\(uuid,text,text,uuid\) to service_role/i);
});
