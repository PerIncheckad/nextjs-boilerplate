'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './garage-overview.module.css';

type GarageFlag = 'UTVECKLA' | 'AVVECKLA' | 'HJULSKIFTE' | 'STILLESTAND';
type Filter = 'ALLA' | GarageFlag | 'FLERA';

type OverviewVehicle = {
  regnr: string;
  model: string | null;
  station: string | null;
  flags: GarageFlag[];
  active_need_count: number;
  downtime_reason: string | null;
  wheel_status: string | null;
};

type Counts = Record<Filter, number>;

const FILTERS: Array<{ key: Filter; label: string; hint: string }> = [
  { key: 'ALLA', label: 'Alla', hint: 'Alla aktiva signaler' },
  { key: 'UTVECKLA', label: 'Utveckla', hint: 'UTVECKLA / IN' },
  { key: 'AVVECKLA', label: 'Avveckla', hint: 'AVVECKLA / UT' },
  { key: 'HJULSKIFTE', label: 'Hjulskifte', hint: 'Aktivt hjulskifte' },
  { key: 'STILLESTAND', label: 'Stillestånd', hint: 'Aktiv DOWNTIME-period' },
  { key: 'FLERA', label: 'Flera behov', hint: 'Minst två samtidiga signaler' },
];

const FLAG_LABEL: Record<GarageFlag, string> = {
  UTVECKLA: 'UTVECKLA',
  AVVECKLA: 'AVVECKLA',
  HJULSKIFTE: 'HJULSKIFTE',
  STILLESTAND: 'STILLESTÅND',
};

export default function GarageOverviewPanel() {
  const [items, setItems] = useState<OverviewVehicle[]>([]);
  const [counts, setCounts] = useState<Counts>({ ALLA: 0, UTVECKLA: 0, AVVECKLA: 0, HJULSKIFTE: 0, STILLESTAND: 0, FLERA: 0 });
  const [filter, setFilter] = useState<Filter>('ALLA');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/garage/overview', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Garageöversikten');
        if (!active) return;
        setItems(payload.data ?? []);
        setCounts(payload.counts ?? { ALLA: 0, UTVECKLA: 0, AVVECKLA: 0, HJULSKIFTE: 0, STILLESTAND: 0, FLERA: 0 });
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garageöversikten');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toUpperCase();
    return items.filter((item) => {
      if (filter === 'FLERA' && item.active_need_count < 2) return false;
      if (filter !== 'ALLA' && filter !== 'FLERA' && !item.flags.includes(filter)) return false;
      if (!needle) return true;
      return [item.regnr, item.model, item.station, item.downtime_reason, item.wheel_status]
        .some((value) => value?.toUpperCase().includes(needle));
    });
  }, [filter, items, query]);

  return (
    <section className={styles.shell} aria-label="Garageöversikt">
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>OPERATIV ÖVERSIKT</div>
          <h2>En bil · flera samtidiga behov</h2>
          <p>Vyerna filtrerar samma fordonsverklighet. En bil kan därför finnas i flera arbetsvyer samtidigt.</p>
        </div>
        <label className={styles.search}>
          <span>Sök</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reg.nr, modell, station…" />
        </label>
      </div>

      <div className={styles.filterGrid}>
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`${styles.filterCard} ${filter === entry.key ? styles.activeFilter : ''}`}
            onClick={() => setFilter(entry.key)}
            aria-pressed={filter === entry.key}
          >
            <span>{entry.label}</span>
            <strong>{counts[entry.key] ?? 0}</strong>
            <small>{entry.hint}</small>
          </button>
        ))}
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {loading ? <div className={styles.empty}>Läser operativa signaler…</div> : visible.length === 0 ? <div className={styles.empty}>Inga fordon i vald vy.</div> : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Bil</th>
                <th>Station</th>
                <th>Aktiva signaler</th>
                <th>Detalj</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.regnr} className={item.active_need_count > 1 ? styles.multiRow : undefined}>
                  <td><strong>{item.regnr}</strong><span>{item.model ?? '—'}</span></td>
                  <td>{item.station ?? '—'}</td>
                  <td>
                    <div className={styles.flags}>
                      {item.flags.map((flag) => <span key={flag} className={styles.flag}>{FLAG_LABEL[flag]}</span>)}
                    </div>
                    {item.active_need_count > 1 ? <small className={styles.multiLabel}>{item.active_need_count} aktiva behov</small> : null}
                  </td>
                  <td>
                    {item.downtime_reason ? <div><strong>Stillestånd:</strong> {item.downtime_reason}</div> : null}
                    {item.wheel_status ? <div><strong>Hjulskifte:</strong> {item.wheel_status}</div> : null}
                    {!item.downtime_reason && !item.wheel_status ? '—' : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
