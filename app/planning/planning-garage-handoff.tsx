'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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

type HandoffResult = { period: string; rows: HandoffRow[]; error: string | null };
type Props = { period: string };

export default function PlanningGarageHandoff({ period }: Props) {
  const [result, setResult] = useState<HandoffResult | null>(null);

  useEffect(() => {
    let active = true;

    void fetch(`/api/garage/planning-sources?period=${encodeURIComponent(period)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { data?: HandoffRow[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa handslaget mot Garaget');
        if (!active) return;
        setResult({ period, rows: body.data ?? [], error: null });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setResult({
          period,
          rows: [],
          error: reason instanceof Error ? reason.message : 'Kunde inte läsa handslaget mot Garaget',
        });
      });

    return () => { active = false; };
  }, [period]);

  const currentResult = result?.period === period ? result : null;
  const rows = currentResult?.rows ?? [];
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

  return (
    <section className={styles.panel} aria-label="BESTÄLLT till Garaget">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>BESTÄLLT / HANDSLAG</div>
          <h2>Planering → Garaget</h2>
          <p>Verifierar sparade BESTÄLLT mot individuella Garage-objekt. Ingen automatisk överföring och ingen ändring av planeringsbeslut.</p>
        </div>
        <Link href="/garage" className={styles.garageLink}>Öppna Garaget</Link>
      </div>

      <div className={styles.summary}>
        <div><span>BESTÄLLT</span><strong>{totals.ordered}</strong></div>
        <div><span>I GARAGET</span><strong>{totals.materialized}</strong></div>
        <div><span>KVAR</span><strong>{totals.remaining}</strong></div>
      </div>

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
