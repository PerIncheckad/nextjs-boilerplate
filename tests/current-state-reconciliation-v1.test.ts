import fs from 'node:fs';
import path from 'node:path';

describe('current-state reconciliation v1', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'migrations/20260903104500_add_current_state_reconciliation_v1.sql'),
    'utf8',
  );

  test('establishes current state without historical backfill', () => {
    expect(sql).toMatch(/CURRENT_STATE_RECONCILIATION/);
    expect(sql).toMatch(/PRE_WRITE_THROUGH_GAP/);
    expect(sql).toMatch(/historicalBackfill', false/);
    expect(sql).toMatch(/historicalCoverageStartsAt', v_established_at/);
    expect(sql).toMatch(/v_established_at/);
    expect(sql).not.toMatch(/v_nybil\.created_at,[\s\S]*'INCHECKAD',[\s\S]*'vehicle_journey_state_reconciliations'/);
  });

  test('refuses reconciliation when verified later state facts exist', () => {
    expect(sql).toMatch(/A later Status rental-readiness fact exists/);
    expect(sql).toMatch(/A later Check-in rental-unavailable fact exists/);
    expect(sql).toMatch(/A later verified rental fact exists/);
  });

  test('only runs for vehicles with no existing journey periods', () => {
    expect(sql).toMatch(/Reconciliation is only permitted when the vehicle has no journey periods/);
  });
});
