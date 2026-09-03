import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(process.cwd(), 'migrations/20260903104500_add_current_state_reconciliation_v1.sql'),
  'utf8',
);

test('establishes current state without historical backfill', () => {
  assert.match(sql, /CURRENT_STATE_RECONCILIATION/);
  assert.match(sql, /PRE_WRITE_THROUGH_GAP/);
  assert.match(sql, /historicalBackfill', false/);
  assert.match(sql, /historicalCoverageStartsAt', v_established_at/);
  assert.match(sql, /v_established_at/);
});

test('refuses reconciliation when verified later state facts exist', () => {
  assert.match(sql, /A later Status rental-readiness fact exists/);
  assert.match(sql, /A later Check-in rental-unavailable fact exists/);
  assert.match(sql, /A later verified rental fact exists/);
});

test('only runs for vehicles with no existing journey periods', () => {
  assert.match(sql, /Reconciliation is only permitted when the vehicle has no journey periods/);
});

test('uses the current reconciliation timestamp, not the historical Nybil timestamp, for the new period', () => {
  assert.match(sql, /v_result := public\.transition_vehicle_journey_state\([\s\S]*v_established_at,[\s\S]*'INCHECKAD',[\s\S]*'vehicle_journey_state_reconciliations'/i);
  assert.match(sql, /'basisSourceRecordedAt', v_nybil\.created_at/);
  assert.match(sql, /'historicalBackfill', false/);
});
