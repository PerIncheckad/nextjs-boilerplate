import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(
  join(process.cwd(), 'app/api/salu/scheduler/route.ts'),
  'utf8',
);

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260820_add_salu_trigger_rpc.sql'),
  'utf8',
);

test('SALU scheduler is separately enabled, token protected and write-gated', () => {
  assert.match(route, /SALU_SCHEDULER_ENABLED !== 'true'/);
  assert.match(route, /SALU_SCHEDULER_TOKEN/);
  assert.match(route, /SALU_WRITES_ENABLED !== 'true'/);
  assert.match(route, /dryRun/);
});

test('SALU scheduler delegates timing decisions to the tested trigger engine', () => {
  assert.match(route, /evaluateSaluTriggers/);
  assert.match(route, /requiresCatchUpPolicy/);
  assert.match(route, /catchUpRequired/);

  const catchUpBlock = route.match(
    /if \(evaluation\.requiresCatchUpPolicy\) \{([\s\S]*?)\n    \}/,
  )?.[1] ?? '';
  assert.match(catchUpBlock, /catchUpRequired\.push/);
  assert.doesNotMatch(catchUpBlock, /apply_salu_trigger_action|admin\.rpc|actions\.push/);
});

test('trigger persistence is atomic, idempotent, pinned and server-only', () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /where e\.event_key = p_event_key/);
  assert.match(migration, /apply_salu_trigger_action/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.apply_salu_trigger_action[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.apply_salu_trigger_action[\s\S]*service_role/i);
});

test('T-30 creates one Bilkontroll-owned NY flag and escalation events update the active flag', () => {
  assert.match(migration, /'NY'/);
  assert.match(migration, /'BILKONTROLL'/);
  assert.match(migration, /'SALU_T10_ESCALATED'/);
  assert.match(migration, /'SALU_T0_PASSED'/);
  assert.match(migration, /set escalation_status = v_escalation/);
});
