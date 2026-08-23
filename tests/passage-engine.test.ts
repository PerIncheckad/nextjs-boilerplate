import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assessPassageReadiness } from '../lib/passage-engine';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260823174500_add_passage_contract_v1.sql'),
  'utf8',
);

test('passage stays blocked while a required handoff is missing or unresolved', () => {
  assert.deepEqual(
    assessPassageReadiness({
      handoffs: [
        { requirementCode: 'A', referenceCode: 'H1', status: null },
        { requirementCode: 'B', referenceCode: 'H2', status: 'ACCEPTED' },
      ],
    }),
    {
      ready: false,
      reasons: [
        { code: 'HANDOFF_MISSING', requirementCode: 'A', referenceCode: 'H1' },
        { code: 'HANDOFF_UNRESOLVED', requirementCode: 'B', referenceCode: 'H2', status: 'ACCEPTED' },
      ],
    },
  );
});

test('verified or cancelled handoffs release their blocking requirement', () => {
  assert.deepEqual(
    assessPassageReadiness({
      handoffs: [
        { requirementCode: 'A', referenceCode: 'H1', status: 'VERIFIED' },
        { requirementCode: 'B', referenceCode: 'H2', status: 'CANCELLED' },
      ],
    }),
    { ready: true, reasons: [] },
  );
});

test('checkpoint passage accepts GODKAND and EJ_RELEVANT but blocks VANTAR and AVVIKELSE', () => {
  assert.deepEqual(
    assessPassageReadiness({
      checkpoints: [
        { requirementCode: 'A', referenceCode: 'C1', status: 'GODKAND' },
        { requirementCode: 'B', referenceCode: 'C2', status: 'EJ_RELEVANT' },
      ],
    }),
    { ready: true, reasons: [] },
  );

  const blocked = assessPassageReadiness({
    checkpoints: [
      { requirementCode: 'A', referenceCode: 'C1', status: 'VANTAR' },
      { requirementCode: 'B', referenceCode: 'C2', status: 'AVVIKELSE' },
    ],
  });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.reasons.length, 2);
});

test('migration defines a read-only readiness gate and does not mutate source-owned SALU state', () => {
  assert.match(migration, /create table public\.passage_definitions/i);
  assert.match(migration, /create table public\.passage_requirements/i);
  assert.match(migration, /function public\.evaluate_routine_passage/i);
  assert.match(migration, /function public\.assert_routine_passage_ready/i);
  assert.match(migration, /SALU_FINAL_ASSESSMENT/);
  assert.match(migration, /SALU_TO_PLANERING/);
  assert.match(migration, /SALU_TO_INKOP/);
  assert.doesNotMatch(migration, /update\s+public\.salu_flags/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.salu_flags/i);
  assert.match(migration, /revoke all on public\.passage_definitions from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.evaluate_routine_passage/i);
});
