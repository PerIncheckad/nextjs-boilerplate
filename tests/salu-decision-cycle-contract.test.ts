import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260820095900_salu_decision_cycle_handoffs.sql'),
  'utf8',
);

const scheduler = readFileSync(
  join(process.cwd(), 'app/api/salu/scheduler/route.ts'),
  'utf8',
);

test('T-30 persistence emits idempotent PLANERING and INKÖP handoff events', () => {
  assert.match(migration, /SALU_PLANERING_HANDOFF_REQUESTED/);
  assert.match(migration, /SALU_INKOP_HANDOFF_REQUESTED/);
  assert.match(migration, /target_layer', 'PLANERING'/);
  assert.match(migration, /target_layer', 'INKÖP'/);
  assert.match(migration, /on conflict \(event_key\) do nothing/i);
});

test('decision reminders are persisted as a supported system trigger without changing escalation status', () => {
  assert.match(migration, /SALU_DECISION_REMINDER_DUE/);
  assert.match(migration, /decision_required', true/);
  assert.match(migration, /decision_options/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
});

test('manual closure outcome is restricted to the five active decisions', () => {
  for (const decision of [
    'SÄLJAS',
    'PLANERA VERKSTAD',
    'LÅNGTID PLANERA SKIFTE',
    'ANNAT',
    'FÖRLÄNGA',
  ]) {
    assert.match(migration, new RegExp(`'${decision}'`));
  }

  assert.doesNotMatch(migration, /FARDIGBEHANDLAD/);
  assert.doesNotMatch(migration, /PLAN_ANDRAD_AVBRUTEN/);
  assert.doesNotMatch(migration, /FARDIG_MED_ACCEPTERAD_AVVIKELSE/);
});

test('scheduler supplies active flag identity and creation date to the ten-day clock', () => {
  assert.match(scheduler, /flag_id,regnr,escalation_status,created_at/);
  assert.match(scheduler, /activeFlagId: activeFlag\?\.flag_id/);
  assert.match(scheduler, /activeFlagCreatedDate: activeFlag\?\.created_at\.slice\(0, 10\)/);
});
