'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildTowerCsv } from '@/lib/tower-export';
import TowerWheelChangePanel from './tower-wheel-change-panel';
import styles from './tower-workspace.module.css';

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
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function age(value: string | null): string {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 0) return '0 h';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
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

function signalWeight(item: CockpitItem): number {
  return (item.overdue ? 100 : 0)
    + (item.waitingVerification ? 40 : 0)
    + item.attention.length * 5
    + (item.state === 'DOWNTIME' ? 10 : 0);
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
  const [selectedReg, setSelectedReg] = useState<string | null>(null);

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
    void load();
  }, [load]);

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
        || (item.station ?? '').toUpperCase().includes(needle)
        || item.ownerFunctions.some((owner) => owner.toUpperCase().includes(needle))
        || item.attention.some((reason) => label(reason).toUpperCase().includes(needle));
    });
  }, [data, station, query]);

  const priorityItems = useMemo(
    () => [...items].sort((a, b) => signalWeight(b) - signalWeight(a)).slice(0, 8),
    [items],
  );

  const selected = useMemo(
    () => items.find((item) => item.regnr === selectedReg) ?? priorityItems[0] ?? null,
    [items, priorityItems, selectedReg],
  );

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
    <div className={styles.workspace}>
      <nav className={styles.flowNav} aria-label="Tower arbetsflöde">
        <span>ARBETSFLÖDE</span>
        <a href="#uppmarksamhet">1. Uppmärksamhet</a>
        <a href="#prioritering">2. Prioritering</a>
        <a href="#verifiering">3. Verifiering</a>
        <a href="#kontrollpunkter">4. Kontrollpunkter</a>
      </nav>

      <section id="uppmarksamhet" className={styles.section}>
        <div className={styles.sectionLabel}><strong>01 / UPPMÄRKSAMHET</strong><span>Vad kräver åtgärd nu, baserat på verifierad operativ data</span></div>

        <div className={styles.toolbar}>
          <label>
            <span>STATION</span>
            <select value={station} onChange={(event) => setStation(event.target.value)}>
              {stations.map((value) => <option key={value} value={value}>{value === 'ALLA' ? 'Alla stationer' : value}</option>)}
            </select>
          </label>
          <label className={styles.search}>
            <span>SÖK</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reg.nr, station, ansvar eller signal" />
          </label>
          <div className={styles.actions}>
            <Link href="/tower/history">Drifthistorik</Link>
            <Link href="/tower/metrics">Driftmätning</Link>
            <button type="button" onClick={exportCurrentView} disabled={!data || items.length === 0}>CSV</button>
            <button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'UPPDATERAR…' : 'UPPDATERA'}</button>
          </div>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.metrics} aria-label="Operativ summering">
          <Metric title="Kräver uppmärksamhet" value={data?.summary.attentionVehicles ?? 0} />
          <Metric title="Blockerade" value={data?.summary.blocked ?? 0} />
          <Metric title="Downtime" value={data?.summary.downtime ?? 0} />
          <Metric title="Försenade" value={data?.summary.overdue ?? 0} alert />
          <Metric title="Väntar verifiering" value={data?.summary.waitingVerification ?? 0} />
        </div>
      </section>

      <section id="prioritering" className={styles.section}>
        <div className={styles.sectionLabel}><strong>02 / PRIORITERING</strong><span>Varför, vem ansvarar, deadline och nästa steg</span></div>
        <div className={styles.priorityGrid}>
          <div className={styles.panel}>
            <div className={styles.panelHead}><strong>PRIORITERADE FORDON</strong><span>{priorityItems.length} visade</span></div>
            {loading && !data ? <div className={styles.empty}>Läser operativ verklighet…</div> : priorityItems.length === 0 ? <div className={styles.empty}>Inga aktiva signaler i vald vy.</div> : (
              <div className={styles.priorityList}>
                {priorityItems.map((item) => (
                  <button key={item.regnr} type="button" className={`${styles.priorityItem} ${selected?.regnr === item.regnr ? styles.priorityActive : ''}`} onClick={() => setSelectedReg(item.regnr)}>
                    <div><strong>{item.regnr}</strong><small>{item.station ?? 'Station okänd'}</small></div>
                    <div className={styles.signals}>{item.attention.length ? item.attention.map((reason) => <span key={reason} className={reason === 'FÖRSENAD' ? styles.dangerTag : styles.tag}>{label(reason)}</span>) : <span className={styles.tag}>Aktiv signal</span>}</div>
                    <div><strong>{item.ownerFunctions.join(' · ') || 'Ej identifierad'}</strong><small>Ansvar</small></div>
                    <div className={`${styles.deadline} ${item.overdue ? styles.overdue : ''}`}>{formatDate(item.deadlineAt)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}><strong>VALT FORDON</strong><span>Verifierad väg vidare</span></div>
            {selected ? (
              <div className={styles.detail}>
                <div className={styles.detailHero}>
                  <div><strong>{selected.regnr}</strong><span>{selected.station ?? 'Station okänd'}</span></div>
                  <em className={`${styles.state} ${selected.overdue ? styles.stateCritical : ''}`}>{selected.overdue ? 'FÖRSENAD' : selected.state ?? 'AKTIV'}</em>
                </div>
                <dl className={styles.detailGrid}>
                  <div><dt>Tillstånd</dt><dd>{selected.state ?? '—'}</dd></div>
                  <div><dt>Tid i läget</dt><dd>{selected.stateStartedAt ? age(selected.stateStartedAt) : '—'}</dd></div>
                  <div><dt>Ansvar</dt><dd>{selected.ownerFunctions.join(' · ') || 'Ej identifierad'}</dd></div>
                  <div><dt>Deadline</dt><dd className={selected.overdue ? styles.overdue : undefined}>{formatDate(selected.deadlineAt)}</dd></div>
                  <div><dt>Action</dt><dd>{selected.actionStatus ?? '—'}</dd></div>
                  <div><dt>Verifiering</dt><dd>{selected.waitingVerification ? 'Väntar' : 'Ej väntande'}</dd></div>
                </dl>
                {selected.downtimeReason ? <div className={styles.detailSection}><span>ORSAK</span><p>{selected.downtimeReason}</p></div> : null}
                <div className={styles.detailSection}><span>NÄSTA STEG</span>{selected.nextSteps.length ? selected.nextSteps.map((step) => <p key={step}>→ {step}</p>) : <p>—</p>}</div>
                <div className={styles.detailActions}>
                  <Link href={selected.links.vagnkort}>ÖPPNA VAGNKORT</Link>
                  {selected.tankReceipt ? <a href={selected.tankReceipt.url} target="_blank" rel="noopener noreferrer">TANKKVITTO</a> : null}
                </div>
              </div>
            ) : <div className={styles.empty}>Välj ett fordon.</div>}
          </div>
        </div>
      </section>

      <section id="verifiering" className={styles.section}>
        <div className={styles.sectionLabel}><strong>03 / VERIFIERING</strong><span>Samlad läsbild med signal, ansvar, deadline, nästa steg och Evidens</span></div>
        {items.length === 0 ? <div className={styles.empty}>Inga fordon matchar aktuell vy.</div> : (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Fordon</th><th>Signal</th><th>Tillstånd</th><th>Ansvar</th><th>Deadline</th><th>Nästa steg</th><th>Evidens</th></tr></thead>
              <tbody>{items.map((item) => (
                <tr key={item.regnr} onClick={() => setSelectedReg(item.regnr)}>
                  <td><strong className={styles.regnr}>{item.regnr}</strong><span className={styles.subtle}>{item.station ?? 'Station okänd'}</span></td>
                  <td><div className={styles.signals}>{item.attention.slice(0, 3).map((reason) => <span key={reason} className={reason === 'FÖRSENAD' ? styles.dangerTag : styles.tag}>{label(reason)}</span>)}</div>{item.downtimeReason ? <span className={styles.subtle}>{item.downtimeReason}</span> : null}</td>
                  <td><strong>{item.state ?? '—'}</strong><span className={styles.subtle}>{item.stateStartedAt ? age(item.stateStartedAt) : '—'}</span></td>
                  <td><strong>{item.ownerFunctions.join(' · ') || 'Ej identifierad'}</strong>{item.waitingVerification ? <span className={styles.subtle}>Väntar verifiering</span> : null}</td>
                  <td><strong>{item.actionStatus ?? '—'}</strong><span className={item.overdue ? styles.overdue : styles.subtle}>{formatDate(item.deadlineAt)}</span></td>
                  <td>{item.nextSteps.length ? item.nextSteps.slice(0, 2).map((step) => <span key={step} className={styles.nextStep}>{step}</span>) : '—'}</td>
                  <td>{item.tankReceipt ? <a className={styles.openLink} href={item.tankReceipt.url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>Tankkvitto →</a> : <Link className={styles.openLink} href={item.links.vagnkort} onClick={(event) => event.stopPropagation()}>Vagnkort →</Link>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section id="kontrollpunkter" className={styles.section}>
        <div className={styles.sectionLabel}><strong>04 / KONTROLLPUNKTER</strong><span>Read-only operativ kontroll; hantering sker i ansvarig arbetsyta</span></div>
        <div className={styles.wheelSurface}><TowerWheelChangePanel /></div>
      </section>
    </div>
  );
}

function Metric({ title, value, alert = false }: { title: string; value: number; alert?: boolean }) {
  return <div className={`${styles.metric} ${alert && value > 0 ? styles.alert : ''}`}><span>{title}</span><strong>{value}</strong></div>;
}
