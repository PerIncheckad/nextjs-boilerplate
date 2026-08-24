import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260824232000_fix_salu_manual_close_decisions_v3.sql'),
  'utf8',
);

test('manual SALU close uses the persisted current owner-decision vocabulary', () => {
  assert.match(migration, /'SÄLJAS'/);
  assert.match(migration, /'PLANERA VERKSTAD'/);
  assert.match(migration, /'LÅNGTID PLANERA SKIFTE'/);
  assert.match(migration, /'ANNAT'/);
  assert.match(migration, /'FÖRLÄNGA'/);
  assert.doesNotMatch(migration, /FARDIGBEHANDLAD/);
  assert.doesNotMatch(migration, /PLAN_ANDRAD_AVBRUTEN/);
  assert.doesNotMatch(migration, /FARDIG_MED_ACCEPTERAD_AVVIKELSE/);
});

test('FÖRLÄNGA is explicitly kept out of the manual close path', () => {
  assert.match(migration, /FÖRLÄNGA changes the active SALU plan and must not close the flag/);
});

test('ANNAT requires comment and unresolved deviations cannot be silently accepted', () => {
  assert.match(migration, /ANNAT requires a closure comment/);
  assert.match(migration, /Remaining SALU deviations require explicit accepted-deviation authorization before closure/);
  assert.match(migration, /status='AVVIKELSE'/);
});

test('manual close still re-asserts passage and writes snapshots to the audit event', () => {
  assert.match(migration, /public\.assert_routine_passage_ready\(/i);
  assert.match(migration, /Manual closure requires SLUTBEDÖMNING/);
  assert.match(migration, /SALU_FLAG_CLOSED_MANUALLY/);
  assert.match(migration, /checkpointSnapshot/);
  assert.match(migration, /childProcessSnapshot/);
  assert.match(migration, /revoke all on function public\.close_salu_flag_manually_v1\(uuid,text,text,uuid\)/i);
  assert.match(migration, /grant execute on function public\.close_salu_flag_manually_v1\(uuid,text,text,uuid\)/i);
});
