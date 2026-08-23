import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assessHandoffPassage,
  isTerminalHandoffStatus,
  transitionHandoffStatus,
  validateHandoffVerification,
} from '../lib/handoff-engine';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260823161000_add_handoff_contract_v1.sql'),
  'utf8',
);

test('handoff follows the locked handshake sequence', () => {
  assert.equal(transitionHandoffStatus('REQUESTED', 'HANDED_OVER'), 'HANDED_OVER');
  assert.equal(transitionHandoffStatus('HANDED_OVER', 'RECEIVED'), 'RECEIVED');
  assert.equal(transitionHandoffStatus('RECEIVED', 'ACCEPTED'), 'ACCEPTED');
  assert.equal(transitionHandoffStatus('ACCEPTED', 'COMPLETED'), 'COMPLETED');
  assert.equal(transitionHandoffStatus('COMPLETED', 'VERIFIED'), 'VERIFIED');
  assert.throws(
    () => transitionHandoffStatus('REQUESTED', 'ACCEPTED'),
    /Invalid handoff transition/,
  );
});

test('terminal handoffs cannot transition', () => {
  assert.equal(isTerminalHandoffStatus('VERIFIED'), true);
  assert.equal(isTerminalHandoffStatus('CANCELLED'), true);
  assert.throws(
    () => transitionHandoffStatus('VERIFIED', 'CANCELLED'),
    /Terminal handoff status VERIFIED cannot transition/,
  );
});

test('evidence-required handoff cannot verify without evidence', () => {
  assert.throws(
    () => validateHandoffVerification({ mode: 'EVIDENCE_REQUIRED', evidenceRefs: [] }),
    /Verified handoff requires evidence/,
  );
  assert.doesNotThrow(() => validateHandoffVerification({
    mode: 'EVIDENCE_REQUIRED',
    evidenceRefs: ['document:123'],
  }));
});

test('unresolved blocking handoff blocks passage', () => {
  assert.deepEqual(
    assessHandoffPassage([{ status: 'ACCEPTED', blocking: true }]),
    { ready: false, reasons: ['BLOCKING_HANDOFF_UNRESOLVED'] },
  );
  assert.deepEqual(
    assessHandoffPassage([{ status: 'VERIFIED', blocking: true }]),
    { ready: true, reasons: [] },
  );
});

test('handoff persistence is versioned, append-only and server-only', () => {
  assert.match(migration, /create table public\.handoff_definitions/i);
  assert.match(migration, /create table public\.handoffs/i);
  assert.match(migration, /create table public\.handoff_events/i);
  assert.match(migration, /handoff_events is append-only/i);
  assert.match(migration, /before update on public\.handoff_events/i);
  assert.match(migration, /before delete on public\.handoff_events/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.handoffs from public, anon, authenticated/i);
  assert.match(migration, /revoke all on public\.handoff_events from public, anon, authenticated/i);
  assert.match(migration, /function public\.transition_handoff/i);
  assert.match(migration, /to service_role/i);
});

test('SALU request signals materialize handoffs without historical backfill', () => {
  assert.match(migration, /SALU_TO_PLANERING/);
  assert.match(migration, /SALU_TO_INKOP/);
  assert.match(migration, /SALU_PLANERING_HANDOFF_REQUESTED/);
  assert.match(migration, /SALU_INKOP_HANDOFF_REQUESTED/);
  assert.match(migration, /after insert on public\.salu_events/i);
  assert.doesNotMatch(migration, /insert into public\.handoffs[\s\S]*select[\s\S]*from public\.salu_events/i);
});
