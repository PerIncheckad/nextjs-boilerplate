'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildTowerCsv } from '@/lib/tower-export';
import styles from './tower.module.css';

type CockpitItem = {
  regnr: string;
  station: string | null;
  state: string | null;
  stateStartedAt: string | null;
  downtimeReason: string | null;
  attention: string[];
  ownerFunctions: string[];
  actionStatus: string | null;
  deadlineAt: string | null;
  overdue: boolean;
  waitingVerification: boolean;
  nextSteps: string[];
  tankReceipt: { url: string; uploadedAt: string | null } | null;
  tankReceiptCount: number;
  links: { vagnkort: string };
};

type CockpitData = {
  generatedAt: string;
  perspective: string;
  stationFilter: string | null;
  summary: {
    attentionVehicles: number;
    downtime: number;
    blocked: number;
    overdue: number;
    waitingVerification: number;
  };
  items: CockpitItem[];
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function age(value: string | null): string {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 0) return '0 h';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days} d ${rest} h`;
}

function label(value: string): string {
  const labels: Record<string, string> = {
    DOWNTIME: 'Downtime',
    BLOCKERANDE_KONTROLLPUNKT: 'Blockerande kontrollpunkt',
    BLOCKERANDE_ACTION: 'Blockerande action',
    BLOCKERANDE_HANDSLAG: 'Blockerande handslag',
    FÖRSENAD: 'Försenad',
    VÄNTAR_VERIFIERING: 'Väntar verifiering',
    SALU_T10: 'SALU T-10',
    SALU_PASSERAD: 'SALU passerad',
  };
  return labels[value] ?? value;
}

async function fetchCockpit(): Promise<CockpitData> {
  const response = await fetch('/api/operator-cockpit', { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Tower');
  return payload.data as CockpitData;
}

function safeFilePart(value: string): string {
  return value.replaceAll(':', '-').replaceAll('.', '-');
}

export default function OperatorCockpit() {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [station, setStation] = useState('ALLA');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchCockpit());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Tower');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchCockpit()
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Tower');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const stations = useMemo(() => {
    const values = new Set((data?.items ?? []).map((item) => item.station).filter(Boolean) as string[]);
    return ['ALLA', ...Array.from(values).sort((a, b) => a.localeCompare(b, 'sv'))];
  }, [data]);

  const items = useMemo(() => {
    const needle = query.trim().toUpperCase();
    return (data?.items ?? []).filter((item) => {
      if (station !== 'ALLA' && item.station !== station) return false;
      if (!needle) return true;
      return item.regnr.includes(needle)
        || item.ownerFunctions.some((owner) => owner.toUpperCase().includes(needle))
        || item.attention.some((reason) => label(reason).toUpperCase().includes(needle));
    });
  }, [data, station, query]);

  const exportCurrentView = useCallback(() => {
    if (!data || items.length === 0) return;
    const csv = buildTowerCsv(items, data.generatedAt);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `incheckad-tower-${safeFilePart(data.generatedAt)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [data, items]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>INCHECKAD / OPERATIV STYRNING</div>
          <h1>Tower</h1>
          <p>Vad kräver min uppmärksamhet just nu?</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/">Startsida</Link>
          <Link className={styles.secondaryButton} href="/tower/history">Drifthistorik</Link>
          <Link className={styles.secondaryButton} href="/tower/metrics">Driftmätning</Link>
          <button className={styles.secondaryButton} type="button" onClick={exportCurrentView} disabled={!data || items.length === 0}>
            Exportera CSV
          </button>
          <button className={styles.primaryButton} type="button" onClick={() => void load()} disabled={loading}>
            {loading ? 'Uppdaterar…' : 'Uppdatera'}
          </button>
        </div>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.metrics} aria-label="Operativ summering">
        <Metric title="Kräver uppmärksamhet" value={data?.summary.attentionVehicles ?? 0} />
        <Metric title="Blockerade" value={data?.summary.blocked ?? 0} />
        <Metric title="Downtime" value={data?.summary.downtime ?? 0} />
        <Metric title="Försenade" value={data?.summary.overdue ?? 0} emphasis />
        <Metric title="Väntar verifiering" value={data?.summary.waitingVerification ?? 0} />
      </section>

      <section className={styles.controls}>
        <label>
          <span>Station</span>
          <select value={station} onChange={(event) => setStation(event.target.value)}>
            {stations.map((value) => <option key={value} value={value}>{value === 'ALLA' ? 'Alla stationer' : value}</option>)}
          </select>
        </label>
        <label className={styles.searchField}>
          <span>Sök</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reg.nr, ansvar eller blockerare" />
        </label>
        <div className={styles.generated}>
          <span>Senast läst</span>
          <strong>{data ? formatDate(data.generatedAt) : '—'}</strong>
        </div>
      </section>

      <section className={styles.tableSection}>
        <div className={styles.tableHeading}>
          <div>
            <h2>Aktuella operativa ärenden</h2>
            <p>En rad per bil. Vagnkortet innehåller individresan och evidensen.</p>
          </div>
          <strong>{items.length} fordon</strong>
        </div>

        {loading && !data ? (
          <div className={styles.empty}>Läser operativ verklighet…</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>Inga fordon matchar aktuell vy.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Fordon</th>
                  <th>Varför</th>
                  <th>Tillstånd</th>
                  <th>Ansvar</th>
                  <th>Action / deadline</th>
                  <th>Nästa steg</th>
                  <th>Evidens</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.regnr} className={item.overdue ? styles.overdueRow : undefined}>
                    <td>
                      <strong className={styles.regnr}>{item.regnr}</strong>
                      <span className={styles.subtle}>{item.station ?? 'Station okänd'}</span>
                    </td>
                    <td>
                      <div className={styles.tags}>
                        {item.attention.map((reason) => (
                          <span key={reason} className={reason === 'FÖRSENAD' ? styles.dangerTag : styles.tag}>{label(reason)}</span>
                        ))}
                      </div>
                      {item.downtimeReason ? <span className={styles.reason}>{item.downtimeReason}</span> : null}
                    </td>
                    <td>
                      <strong>{item.state ?? '—'}</strong>
                      <span className={styles.subtle}>{item.stateStartedAt ? age(item.stateStartedAt) : '—'}</span>
                    </td>
                    <td>
                      <strong>{item.ownerFunctions.join(' · ') || 'Ej identifierad'}</strong>
                      {item.waitingVerification ? <span className={styles.subtle}>Väntar verifiering</span> : null}
                    </td>
                    <td>
                      <strong>{item.actionStatus ?? '—'}</strong>
                      <span className={item.overdue ? styles.overdueText : styles.subtle}>{formatDate(item.deadlineAt)}</span>
                    </td>
                    <td>
                      {item.nextSteps.length ? item.nextSteps.map((step) => <span key={step} className={styles.nextStep}>{step}</span>) : '—'}
                    </td>
                    <td>
                      {item.tankReceipt ? (
                        <>
                          <a className={styles.openLink} href={item.tankReceipt.url} target="_blank" rel="noopener noreferrer">Tankkvitto →</a>
                          <span className={styles.subtle}>{formatDate(item.tankReceipt.uploadedAt)}{item.tankReceiptCount > 1 ? ` · ${item.tankReceiptCount} kvitton` : ''}</span>
                        </>
                      ) : '—'}
                    </td>
                    <td><Link className={styles.openLink} href={item.links.vagnkort}>Öppna →</Link></td>
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

function Metric({ title, value, emphasis = false }: { title: string; value: number; emphasis?: boolean }) {
  return (
    <div className={`${styles.metric} ${emphasis && value > 0 ? styles.metricEmphasis : ''}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
