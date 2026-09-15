'use client';

import { useCallback, useEffect, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';
import styles from './garage-sista-incheckning-panel.module.css';

type Row = {
  sista_incheckning_id: string;
  garage_item_id: string;
  decision_id: string;
  decision_version: number;
  checkin_id: string;
  regnr: string;
  final_checkin_completed_at: string;
  checkin_checker_name: string | null;
  checkin_checker_email: string | null;
  verified_at: string;
  garage: {
    planned_station: string | null;
    transport_status: string | null;
    salu_final_timing_at: string | null;
    salu_transport_details: string | null;
    salu_repair_destination: string | null;
    salu_operational_note: string | null;
    completed_at: string | null;
    voided_at: string | null;
  } | null;
  checkin: {
    id: string;
    status: string;
    completed_at: string;
    current_city: string | null;
    current_station: string | null;
    current_location_note: string | null;
    has_new_damages: boolean | null;
    checklist: Record<string, unknown> | null;
  } | null;
  conflicts: Array<{
    conflict_id: string;
    conflicting_checkin_id: string;
    checkin_completed_at: string;
    conflict_reason: string;
    detected_at: string;
  }>;
};

function stockholm(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

export default function GarageSistaIncheckningPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedApiFetch('/api/garage/sista-incheckning', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa SISTA INCHECKNING');
      setRows((payload.data ?? []) as Row[]);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa SISTA INCHECKNING');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && rows.length === 0) return <div className={styles.state}>Läser SISTA INCHECKNING…</div>;
  if (error && rows.length === 0) return <div className={styles.error}>{error}</div>;
  if (rows.length === 0) return null;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <span>GARAGE / SALU PLANERING</span>
          <h3>SISTA INCHECKNING</h3>
          <p>Verifierad Check-in är låst till exakt SISTA HYRAN-version. Garage-objektet är fortsatt öppet för efterhantering.</p>
        </div>
        <strong>{rows.length} VERIFIERADE</strong>
      </div>
      <div className={styles.rows}>
        {rows.map((row) => (
          <article className={styles.row} key={row.sista_incheckning_id}>
            <div className={styles.identity}>
              <strong>{row.regnr}</strong>
              <span>SISTA HYRAN V{row.decision_version}</span>
              <em>{row.conflicts.length ? `${row.conflicts.length} KONFLIKT` : 'VERIFIERAD'}</em>
            </div>
            <div className={styles.facts}>
              <div><span>EXAKT CHECK-IN</span><strong>{row.checkin_id}</strong></div>
              <div><span>COMPLETED AT</span><strong>{stockholm(row.final_checkin_completed_at)}</strong></div>
              <div><span>VERIFIERAD AV</span><strong>{row.checkin_checker_name || row.checkin_checker_email || '—'}</strong></div>
              <div><span>PLATS</span><strong>{row.checkin?.current_station || row.checkin?.current_city || row.garage?.planned_station || '—'}</strong></div>
              <div><span>NY SKADA</span><strong>{row.checkin?.has_new_damages ? 'JA – HANDPÅLÄGGNING KAN KRÄVAS' : 'INGEN NY SKADA FLAGGAD'}</strong></div>
              <div><span>GARAGE</span><strong>{row.garage?.completed_at ? 'STÄNGD' : 'ÖPPEN FÖR FÄRDIGSTÄLLANDE'}</strong></div>
            </div>
            {row.conflicts.length ? <div className={styles.conflict}>Senare completed Check-in har registrerats som exception. Den låsta SISTA INCHECKNINGEN har inte skrivits över.</div> : null}
          </article>
        ))}
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
    </section>
  );
}
