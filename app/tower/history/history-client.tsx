'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './history.module.css';

type DriftEvent = {
  occurredAt: string;
  regnr: string | null;
  source: 'VEHICLE_JOURNEY' | 'CHECKPOINT_ACTION' | 'HANDOFF';
  eventType: string;
  status: string | null;
  checkpointCode: string | null;
  sourceSystem: string | null;
  sourceEntity: string | null;
  actorSource: string | null;
};

type HistoryData = {
  generatedAt: string;
  hours: number;
  since: string;
  summary: {
    events: number;
    vehicles: number;
    manualEvents: number;
    systemEvents: number;
    handoffEvents: number;
    actionEvents: number;
  };
  eventTypes: Array<{ eventType: string; count: number }>;
  events: DriftEvent[];
};

const WINDOWS = [
  { hours: 24, label: '24 timmar' },
  { hours: 72, label: '72 timmar' },
  { hours: 168, label: '7 dagar' },
] as const;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function sourceLabel(source: DriftEvent['source']): string {
  if (source === 'VEHICLE_JOURNEY') return 'Fordonsresa';
  if (source === 'CHECKPOINT_ACTION') return 'Action';
  return 'Handslag';
}

async function fetchHistory(hours: number): Promise<HistoryData> {
  const response = await fetch(`/api/operator-history?hours=${hours}`, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa drifthistorik');
  return payload.data as HistoryData;
}

export default function OperatorHistory() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async (windowHours: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchHistory(windowHours));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa drifthistorik');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(hours);
  }, [hours, load]);

  const events = useMemo(() => {
    const needle = query.trim().toUpperCase();
    if (!needle) return data?.events ?? [];
    return (data?.events ?? []).filter((event) =>
      event.regnr?.includes(needle)
      || event.eventType.toUpperCase().includes(needle)
      || event.checkpointCode?.toUpperCase().includes(needle)
      || event.status?.toUpperCase().includes(needle)
      || sourceLabel(event.source).toUpperCase().includes(needle),
    );
  }, [data, query]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>INCHECKAD / DRIFT & EVIDENS</div>
          <h1>Drifthistorik</h1>
          <p>Vad har faktiskt registrerats i driften över tid?</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondaryButton} href="/tower">Tower</Link>
          <Link className={styles.secondaryButton} href="/">Startsida</Link>
          <button className={styles.primaryButton} type="button" onClick={() => void load(hours)} disabled={loading}>
            {loading ? 'Uppdaterar…' : 'Uppdatera'}
          </button>
        </div>
      </header>

      <div className={styles.notice}>
        Read-only vy över redan registrerade händelser. Den skapar ingen ny sanning, ändrar inga processer och gör ingen monetär tolkning.
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.metrics} aria-label="Driftsummering">
        <Metric title="Händelser" value={data?.summary.events ?? 0} />
        <Metric title="Fordon" value={data?.summary.vehicles ?? 0} />
        <Metric title="System" value={data?.summary.systemEvents ?? 0} />
        <Metric title="Manuella" value={data?.summary.manualEvents ?? 0} />
        <Metric title="Handslag" value={data?.summary.handoffEvents ?? 0} />
        <Metric title="Actions" value={data?.summary.actionEvents ?? 0} />
      </section>

      <section className={styles.controls}>
        <label>
          <span>Tidsfönster</span>
          <select value={hours} onChange={(event) => setHours(Number(event.target.value))}>
            {WINDOWS.map((window) => <option key={window.hours} value={window.hours}>{window.label}</option>)}
          </select>
        </label>
        <label>
          <span>Sök</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reg.nr, händelse, kontrollpunkt eller status" />
        </label>
        <div className={styles.generated}>
          <span>Senast läst</span>
          <strong>{data ? formatDate(data.generatedAt) : '—'}</strong>
        </div>
      </section>

      <section className={styles.breakdown}>
        <div>
          <h2>Händelsetyper</h2>
          <p>Fördelning i valt tidsfönster.</p>
        </div>
        <div className={styles.typeList}>
          {(data?.eventTypes ?? []).slice(0, 12).map((item) => (
            <span key={item.eventType}><strong>{item.count}</strong> {item.eventType}</span>
          ))}
          {!loading && (data?.eventTypes.length ?? 0) === 0 ? <span>Inga registrerade händelser.</span> : null}
        </div>
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableHeading}>
          <div>
            <h2>Verifierad händelsehistorik</h2>
            <p>Senaste registrerade händelser först. Vagnkortet är fortsatt individvyn för bilen.</p>
          </div>
          <strong>{events.length} rader</strong>
        </div>

        {loading && !data ? (
          <div className={styles.empty}>Läser registrerad drift…</div>
        ) : events.length === 0 ? (
          <div className={styles.empty}>Inga händelser matchar aktuell vy.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Tid</th>
                  <th>Fordon</th>
                  <th>Källa</th>
                  <th>Händelse</th>
                  <th>Status</th>
                  <th>Kontrollpunkt / handslag</th>
                  <th>Aktörstyp</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => (
                  <tr key={`${event.occurredAt}-${event.eventType}-${event.regnr ?? 'none'}-${index}`}>
                    <td>{formatDate(event.occurredAt)}</td>
                    <td><strong className={styles.regnr}>{event.regnr ?? '—'}</strong></td>
                    <td>
                      <strong>{sourceLabel(event.source)}</strong>
                      <span className={styles.subtle}>{event.sourceSystem ?? '—'}</span>
                    </td>
                    <td><strong>{event.eventType}</strong></td>
                    <td>{event.status ?? '—'}</td>
                    <td>{event.checkpointCode ?? '—'}</td>
                    <td>{event.actorSource ?? '—'}</td>
                    <td>{event.regnr ? <Link className={styles.openLink} href={`/vagnkort?reg=${encodeURIComponent(event.regnr)}`}>Öppna →</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className={styles.metric}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
