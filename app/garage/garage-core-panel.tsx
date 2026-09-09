'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './garage-core.module.css';

type HandoffState = 'EJ_STARTAD' | 'VANTAR' | 'PAGAR' | 'VERIFIERAD';
type Direction = 'IN' | 'UT' | null;

type CoreItem = {
  garage_item_id: string;
  regnr: string | null;
  model: string;
  direction: Direction;
  source_kind: string;
  source_label: string;
  source_record: string;
  source_journey_period_id: string | null;
  source_journey_event_id: string | null;
  why_here: string;
  established_at: string;
  staging_status: string;
  next_owner: 'NYBIL' | 'AVVECKLA' | null;
  handoff_state: HandoffState;
  handoff_label: string;
  handoff_verified_at: string | null;
  blockers: string[];
  module_href: string | null;
  avveckla_case_id: string | null;
  avveckla_reason: string | null;
};

type Counts = { active: number; in: number; ut: number; waiting: number; inProgress: number; verified: number };

type Filter = 'ALLA' | 'IN' | 'UT';

const EMPTY_COUNTS: Counts = { active: 0, in: 0, ut: 0, waiting: 0, inProgress: 0, verified: 0 };

function statusClass(state: HandoffState): string {
  if (state === 'VERIFIERAD') return styles.verified;
  if (state === 'PAGAR') return styles.progress;
  if (state === 'VANTAR') return styles.waiting;
  return styles.notStarted;
}

function directionLabel(direction: Direction): string {
  if (direction === 'IN') return 'IN';
  if (direction === 'UT') return 'UT';
  return '—';
}

export default function GarageCorePanel() {
  const [items, setItems] = useState<CoreItem[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [filter, setFilter] = useState<Filter>('ALLA');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/garage/core', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Garage Core');
        if (!active) return;
        setItems(payload.data ?? []);
        setCounts(payload.counts ?? EMPTY_COUNTS);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garage Core');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleUpperCase('sv-SE');
    return items.filter((item) => {
      if (filter !== 'ALLA' && item.direction !== filter) return false;
      if (!needle) return true;
      return [item.regnr, item.model, item.source_label, item.source_record, item.why_here, item.next_owner, item.handoff_label]
        .filter(Boolean)
        .some((value) => String(value).toLocaleUpperCase('sv-SE').includes(needle));
    });
  }, [filter, items, query]);

  return (
    <section className={styles.shell} aria-label="Garage Core staging och handoff">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>GARAGE CORE</span>
          <h2>Vad ligger hos mig, varför, och vem tar över?</h2>
          <p>Read-model för aktiva Garage-episoder. Visar staging, provenance och verifierade handslag — inte andra modulers arbetsinnehåll.</p>
        </div>
        <label className={styles.search}>
          <span>SÖK</span>
          <input aria-label="Sök" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reg.nr, källa, nästa ägare…" />
        </label>
      </header>

      <div className={styles.summary}>
        <button type="button" className={filter === 'ALLA' ? styles.activeFilter : ''} onClick={() => setFilter('ALLA')}><span>AKTIVA</span><strong>{counts.active}</strong></button>
        <button type="button" className={filter === 'IN' ? styles.activeFilter : ''} onClick={() => setFilter('IN')}><span>IN</span><strong>{counts.in}</strong></button>
        <button type="button" className={filter === 'UT' ? styles.activeFilter : ''} onClick={() => setFilter('UT')}><span>UT</span><strong>{counts.ut}</strong></button>
        <div><span>VÄNTAR / EJ STARTAD</span><strong>{counts.waiting}</strong></div>
        <div><span>PÅGÅR</span><strong>{counts.inProgress}</strong></div>
        <div><span>VERIFIERADE</span><strong>{counts.verified}</strong></div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {loading ? <div className={styles.empty}>Läser Garage Core…</div> : null}
      {!loading && !error && visible.length === 0 ? <div className={styles.empty}>Inga Garage-episoder i vald vy.</div> : null}

      {!loading && !error ? (
        <div className={styles.list}>
          {visible.map((item) => (
            <article key={item.garage_item_id} className={styles.card}>
              <div className={styles.identity}>
                <div>
                  <strong>{item.regnr || 'REGNR SAKNAS'}</strong>
                  <span>{item.model}</span>
                </div>
                <span className={item.direction === 'UT' ? styles.ut : styles.in}>{directionLabel(item.direction)}</span>
              </div>

              <dl className={styles.grid}>
                <div><dt>KÄLLA</dt><dd>{item.source_label}</dd></div>
                <div><dt>SOURCE / PROVENANCE</dt><dd><code>{item.source_record}</code></dd></div>
                <div><dt>VARFÖR HÄR</dt><dd>{item.why_here}</dd></div>
                <div><dt>ETABLERAD</dt><dd>{new Date(item.established_at).toLocaleString('sv-SE')}</dd></div>
                <div><dt>STAGING</dt><dd>{item.staging_status}</dd></div>
                <div><dt>NÄSTA ÄGARE</dt><dd>{item.next_owner ?? 'EJ FASTSTÄLLD'}</dd></div>
              </dl>

              <div className={styles.handoffRow}>
                <div>
                  <span className={styles.label}>HANDOFF</span>
                  <strong className={statusClass(item.handoff_state)}>{item.handoff_label}</strong>
                  {item.handoff_verified_at ? <small>Verifierad {new Date(item.handoff_verified_at).toLocaleString('sv-SE')}</small> : null}
                </div>
                <div>
                  <span className={styles.label}>BLOCKERARE</span>
                  {item.blockers.length > 0 ? item.blockers.map((blocker) => <strong key={blocker} className={styles.blocker}>{blocker}</strong>) : <strong>INGA VERIFIERADE BLOCKERARE</strong>}
                </div>
                <div className={styles.actions}>
                  {item.module_href ? <Link href={item.module_href} aria-label={`Öppna ${item.next_owner}`}>ÖPPNA {item.next_owner} →</Link> : item.direction === 'UT' ? <a href="#avveckla-handoff" aria-label="Starta handoff">STARTA HANDOFF ↓</a> : null}
                </div>
              </div>

              {item.source_journey_period_id ? <div className={styles.trace}>Layer1 period: <code>{item.source_journey_period_id}</code>{item.source_journey_event_id ? <> · event: <code>{item.source_journey_event_id}</code></> : null}</div> : null}
              {item.avveckla_case_id ? <div className={styles.trace}>AVVECKLA case: <code>{item.avveckla_case_id}</code>{item.avveckla_reason ? <> · orsak: {item.avveckla_reason}</> : null}</div> : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
