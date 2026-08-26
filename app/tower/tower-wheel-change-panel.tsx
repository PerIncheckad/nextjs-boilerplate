'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './tower-wheel-change.module.css';

type WheelStatus = 'KRAVS' | 'BOKAD' | 'PAGAENDE' | 'KLAR' | 'AVVIKELSE';

type WheelChange = {
  wheel_change_id: string;
  regnr: string;
  status: WheelStatus;
  booked_for: string | null;
  supplier: string | null;
  location: string | null;
  note: string | null;
  updated_at: string;
  overdue: boolean;
};

const statusLabel = (status: WheelStatus) => ({
  KRAVS: 'Krävs / ej bokad',
  BOKAD: 'Bokad',
  PAGAENDE: 'Pågående',
  KLAR: 'Klar',
  AVVIKELSE: 'Avvikelse',
})[status];

function dateLabel(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function TowerWheelChangePanel() {
  const [items, setItems] = useState<WheelChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/garage/wheel-changes', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa hjulskiften');
        if (!active) return;
        setItems((payload.data?.wheelChanges ?? []) as WheelChange[]);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa hjulskiften');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const open = useMemo(() => items.filter((item) => item.status !== 'KLAR'), [items]);
  const deviations = open.filter((item) => item.status === 'AVVIKELSE').length;
  const overdue = open.filter((item) => item.overdue).length;

  return (
    <section className={styles.shell} aria-label="Hjulskifte översikt">
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>TOWER / HJULSKIFTE</div>
          <h2>Hjulskifte</h2>
          <p>Read-only kontrollvy. Operativ hantering sker i Garaget.</p>
        </div>
        <div className={styles.metrics}>
          <span><strong>{open.length}</strong> öppna</span>
          <span><strong>{deviations}</strong> avvikelser</span>
          <span><strong>{overdue}</strong> passerad bokning</span>
          <Link href="/garage" className={styles.link}>Öppna Garaget →</Link>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {loading ? <div className={styles.empty}>Läser hjulskiften…</div> : open.length === 0 ? <div className={styles.empty}>Inga öppna hjulskiften.</div> : (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Bil</th><th>Status</th><th>Bokad tid</th><th>Leverantör</th><th>Plats</th><th>Kommentar</th></tr></thead>
            <tbody>{open.map((item) => (
              <tr key={item.wheel_change_id} className={item.status === 'AVVIKELSE' || item.overdue ? styles.attentionRow : undefined}>
                <td><strong>{item.regnr}</strong></td>
                <td><strong>{statusLabel(item.status)}</strong>{item.overdue ? <span className={styles.flag}>Passerad bokning</span> : null}</td>
                <td>{dateLabel(item.booked_for)}</td>
                <td>{item.supplier ?? '—'}</td>
                <td>{item.location ?? '—'}</td>
                <td>{item.note ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
