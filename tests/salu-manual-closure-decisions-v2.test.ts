import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260824233000_fix_salu_manual_closure_decisions_v2.sql'),
  'utf8',
);

test('manual SALU closure v2 uses the five source-owned decisions', () => {
  for (const decision of [
    'SÄLJAS',
    'PLANERA VERKSTAD',
    'LÅNGTID PLANERA SKIFTE',
    'ANNAT',
    'FÖRLÄNGA',
  ]) {
    assert.match(migration, new RegExp(`'${decision}'`));
  }

  assert.doesNotMatch(migration, /'FARDIGBEHANDLAD'/);
  assert.doesNotMatch(migration, /'PLAN_ANDRAD_AVBRUTEN'/);
  assert.doesNotMatch(migration, /'FARDIG_MED_ACCEPTERAD_AVVIKELSE'/);
});

test('FÖRLÄNGA is versioned to v2 and requires a new saludatum', () => {
  assert.match(migration, /function public\.close_salu_flag_manually_v2\(/i);
  assert.match(migration, /p_new_saludatum date/i);
  assert.match(migration, /FÖRLÄNGA requires a new saludatum/);
  assert.match(migration, /New saludatum is only valid for FÖRLÄNGA/);
  assert.match(migration, /SALU_SALUDATUM_CHANGED/);
});

test('manual closure keeps final-assessment passage as the blocking gate', () => {
  assert.match(migration, /public\.assert_routine_passage_ready\(/i);
  assert.match(migration, /SALU_FINAL_ASSESSMENT/);
  assert.match(migration, /Manual closure requires SLUTBEDÖMNING/);
  assert.match(migration, /SALU_FLAG_CLOSED_MANUALLY/);
  assert.match(migration, /checkpointSnapshot/);
  assert.match(migration, /childProcessSnapshot/);
});

test('closure RPCs remain server-only', () => {
  assert.match(migration, /revoke all on function public\.close_salu_flag_manually_v1\(uuid,text,text,uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.close_salu_flag_manually_v2\(uuid,text,text,date,uuid\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.close_salu_flag_manually_v2\(uuid,text,text,date,uuid\)[\s\S]*to service_role/i);
});
