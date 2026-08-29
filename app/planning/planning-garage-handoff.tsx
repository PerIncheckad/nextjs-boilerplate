'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './planning-garage-handoff.module.css';

type HandoffRow = {
  planning_cell_id: string;
  period_code: string;
  model: string;
  station: string;
  ordered_count: number;
  note: string | null;
  materialized_count: number;
  remaining_count: number;
};

type PlanningStatus = 'PAGAENDE' | 'KLAR';
type HandoffResult = { period: string; rows: HandoffRow[]; status: PlanningStatus; error: string | null };
type Props = { period: string };

export default function PlanningGarageHandoff({ period }: Props) {
  const [result, setResult] = useState<HandoffResult | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/garage/planning-sources?period=${encodeURIComponent(period)}`, { cache: 'no-store' });
    const body = await response.json() as { data?: HandoffRow[]; status?: PlanningStatus; error?: string };
    if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa handslaget mot Garaget');
    setResult({ period, rows: body.data ?? [], status: body.status ?? 'PAGAENDE', error: null });
  }, [period]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/garage/planning-sources?period=${encodeURIComponent(period)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { data?: HandoffRow[]; status?: PlanningStatus; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa handslaget mot Garaget');
        if (!active) return;
        setResult({ period, rows: body.data ?? [], status: body.status ?? 'PAGAENDE', error: null });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setResult({ period, rows: [], status: 'PAGAENDE', error: reason instanceof Error ? reason.message : 'Kunde inte läsa handslaget mot Garaget' });
      });
    return () => { active = false; };
  }, [period]);

  const currentResult = result?.period === period ? result : null;
  const rows = currentResult?.rows ?? [];
  const planningStatus = currentResult?.status ?? 'PAGAENDE';
  const error = currentResult?.error ?? null;
  const loading = currentResult === null;

  const totals = useMemo(() => rows.reduce(
    (sum, row) => ({
      ordered: sum.ordered + Number(row.ordered_count || 0),
      materialized: sum.materialized + Number(row.materialized_count || 0),
      remaining: sum.remaining + Number(row.remaining_count || 0),
    }),
    { ordered: 0, materialized: 0, remaining: 0 },
  ), [rows]);

  const changeStatus = async (nextStatus: PlanningStatus) => {
    setStatusError(null);
    if (nextStatus === 'KLAR' && window.localStorage.getItem(`incheckad-planning-draft-v3:${period}`)) {
      setStatusError('Det finns osparade ändringar i Planering. Spara allt innan månaden markeras KLAR.');
      return;
    }
    setChangingStatus(true);
    try {
      const response = await fetch('/api/planning/period-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_code: period, status: nextStatus }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Kunde inte uppdatera planeringsstatus');
      await load();
    } catch (reason) {
      setStatusError(reason instanceof Error ? reason.message : 'Kunde inte uppdatera planeringsstatus');
    } finally {
      setChangingStatus(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="BESTÄLLT till Garaget">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>BESTÄLLT / HANDSLAG</div>
          <h2>Planering → Garaget</h2>
          <p>När månaden markeras KLAR skapas sparade BESTÄLLT automatiskt som individuella UTVECKLA / IN-objekt i Garaget.</p>
        </div>
        <div>
          <button type="button" className={styles.garageLink} disabled={changingStatus} onClick={() => void changeStatus(planningStatus === 'KLAR' ? 'PAGAENDE' : 'KLAR')}>
            {changingStatus ? 'Sparar…' : planningStatus === 'KLAR' ? 'Öppna planering igen' : 'Markera planering KLAR'}
          </button>
          <Link href={`/garage?period=${period}&direction=IN`} className={styles.garageLink}>Öppna Garaget</Link>
        </div>
      </div>

      <div className={styles.summary}>
        <div><span>PLANERING</span><strong>{planningStatus === 'KLAR' ? 'KLAR' : 'PÅGÅENDE'}</strong></div>
        <div><span>BESTÄLLT</span><strong>{totals.ordered}</strong></div>
        <div><span>I GARAGET</span><strong>{totals.materialized}</strong></div>
        <div><span>KVAR</span><strong>{totals.remaining}</strong></div>
      </div>

      {planningStatus !== 'KLAR' ? <div className={styles.error}>BESTÄLLT ligger kvar i Planering tills månaden markeras KLAR. Då skapas Garage-objekten automatiskt.</div> : null}
      {statusError ? <div className={styles.error}>{statusError}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      {loading ? <div className={styles.empty}>Läser handslag…</div> : rows.length === 0 ? (
        <div className={styles.empty}>Inga sparade BESTÄLLT finns för {period}.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Modell</th><th>Station</th><th>BESTÄLLT</th><th>I Garaget</th><th>Kvar</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.planning_cell_id}>
                  <td><strong>{row.model}</strong></td>
                  <td>{row.station}</td>
                  <td>{row.ordered_count}</td>
                  <td>{row.materialized_count}</td>
                  <td>{row.remaining_count}</td>
                  <td><span className={row.remaining_count === 0 ? styles.complete : styles.pending}>{row.remaining_count === 0 ? 'HELT I GARAGET' : 'ÅTERSTÅR'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}