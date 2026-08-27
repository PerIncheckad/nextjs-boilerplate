'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import styles from './salu-overview.module.css';

type MonthRow = { index: number; period: string; label: string; count: number; cumulativeCount: number; orderedCount: number };
type ModelRow = { key: string; label: string; monthCounts: number[]; orderedMonthCounts: number[]; stationCounts: Record<string, number>; total: number; orderedTotal: number };
type SaluItem = {
  regnr: string;
  saluDate: string;
  period: string;
  monthIndex: number;
  modelKey: string;
  model: string;
  brand: string | null;
  stationCode: string | null;
  stationName: string | null;
  city: string | null;
};
type Payload = {
  period: string;
  horizonMonths: number;
  months: MonthRow[];
  total: number;
  orderedTotal: number;
  stationTotals: Record<string, number>;
  models: ModelRow[];
  items: SaluItem[];
  semantics: string;
};
type DecisionRow = {
  regnr: string;
  decision_status: 'REPLACE' | 'CANCELLED';
  salu_date_at_decision: string;
  model_snapshot: string | null;
  station_code_snapshot: string | null;
};
type DecisionReadPayload = { data?: DecisionRow[]; storageReady?: boolean; error?: string };
type DecisionWritePayload = { data?: DecisionRow; storageReady?: boolean; error?: string };
type Props = { period: string; onPeriodChange: (period: string) => void };

const WIDTH_STORAGE_KEY = 'incheckad-planning-salu-column-widths-v1';
function currentPeriod() { return new Date().toISOString().slice(0, 7); }

export default function SaluOverview({ period, onPeriodChange }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, DecisionRow>>({});
  const [decisionStorageReady, setDecisionStorageReady] = useState<boolean | null>(null);
  const [decisionSaving, setDecisionSaving] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [modelWidth, setModelWidth] = useState(190);
  const [dataWidth, setDataWidth] = useState(86);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(WIDTH_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as { modelWidth?: number; dataWidth?: number };
        if (typeof saved.modelWidth === 'number') setModelWidth(Math.min(360, Math.max(130, saved.modelWidth)));
        if (typeof saved.dataWidth === 'number') setDataWidth(Math.min(150, Math.max(58, saved.dataWidth)));
      } catch { /* keep defaults */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WIDTH_STORAGE_KEY, JSON.stringify({ modelWidth, dataWidth }));
  }, [modelWidth, dataWidth]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/planning/salu-overview?period=${encodeURIComponent(period)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? 'Kunde inte läsa SALU-översikten');
        if (!active) return;
        const nextData = body.data as Payload;
        setError(null);
        setSelectedModel(null);
        setDecisionNotice(null);
        setDecisions({});
        setDecisionStorageReady(null);
        setData(nextData);
        const regnrs = nextData.items.map((item) => item.regnr);
        if (regnrs.length === 0) return;
        const decisionResponse = await fetch(`/api/planning/replacement-decisions?regnrs=${encodeURIComponent(regnrs.join(','))}`, { cache: 'no-store' });
        const decisionBody = await decisionResponse.json() as DecisionReadPayload;
        if (!decisionResponse.ok) throw new Error(decisionBody.error ?? 'Kunde inte läsa ersättningsbeslut');
        if (!active) return;
        setDecisionStorageReady(decisionBody.storageReady ?? true);
        setDecisions(Object.fromEntries((decisionBody.data ?? []).map((row) => [row.regnr, row])));
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Kunde inte läsa SALU-översikten'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period]);

  const detailItems = useMemo(() => {
    if (!data || !selectedModel) return [];
    return data.items.filter((item) => item.modelKey === selectedModel);
  }, [data, selectedModel]);

  const activeReplacementCount = useMemo(
    () => Object.values(decisions).filter((decision) => decision.decision_status === 'REPLACE').length,
    [decisions],
  );

  const periodChanging = data?.period !== period && !error;
  const tableStyle = { '--model-width': `${modelWidth}px`, '--data-width': `${dataWidth}px` } as CSSProperties;

  const changePeriod = (nextPeriod: string) => {
    onPeriodChange(nextPeriod || currentPeriod());
  };

  const setReplacementDecision = async (item: SaluItem, nextStatus: 'REPLACE' | 'CANCELLED') => {
    setDecisionSaving(item.regnr);
    setError(null);
    setDecisionNotice(null);
    try {
      const response = await fetch('/api/planning/replacement-decisions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regnr: item.regnr,
          decisionStatus: nextStatus,
          saluDate: item.saluDate,
          model: item.model,
          stationCode: item.stationCode,
        }),
      });
      const body = await response.json() as DecisionWritePayload;
      if (!response.ok || !body.data) throw new Error(body.error ?? 'Kunde inte spara ersättningsbeslut');
      setDecisionStorageReady(body.storageReady ?? true);
      const savedDecision = body.data;
      setDecisions((current) => ({ ...current, [item.regnr]: savedDecision }));
      setDecisionNotice(nextStatus === 'REPLACE' ? `${item.regnr}: ERSÄTT är beslutat.` : `${item.regnr}: ersättningsbeslut borttaget.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kunde inte spara ersättningsbeslut');
    } finally {
      setDecisionSaving(null);
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>SALU / BESLUTSSTÖD</div>
          <h2>Kommande SALU — 1 till 4 månader</h2>
          <p>SALU informerar. BESTÄLLT visas bredvid som separat verksamhetsbeslut — ingen automatisk nettning.</p>
        </div>
        <div className={styles.headerControls}>
          <div className={styles.columnControls} aria-label="Kolumnbredder">
            <label><span>Modell</span><input type="range" min={130} max={360} step={10} value={modelWidth} onChange={(event) => setModelWidth(Number(event.target.value))} /></label>
            <label><span>Data</span><input type="range" min={58} max={150} step={4} value={dataWidth} onChange={(event) => setDataWidth(Number(event.target.value))} /></label>
          </div>
          <label className={styles.period}><span>Planeringsmånad</span><input type="month" value={period} onChange={(event) => changePeriod(event.target.value)} /></label>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {decisionNotice ? <div className={styles.notice}>{decisionNotice}</div> : null}
      {decisionStorageReady === false ? <div className={styles.storageWarning}>ERSÄTT kan inte sparas eftersom beslutslagret inte är tillgängligt.</div> : null}
      {loading || periodChanging ? <div className={styles.loading}>Läser kommande SALU…</div> : data ? (
        <>
          <div className={styles.horizonGrid}>
            {data.months.map((month) => (
              <article key={month.period} className={styles.horizonCard}>
                <span>{month.index + 1} MÅN</span>
                <strong>{month.cumulativeCount}</strong>
                <small>{month.label} · SALU {month.count} · BESTÄLLT {month.orderedCount}</small>
              </article>
            ))}
            <article className={styles.horizonCard}><span>HELHET 4 MÅN</span><strong>{data.total}</strong><small>SALU {data.total} · BESTÄLLT {data.orderedTotal}</small></article>
            <article className={styles.horizonCard}><span>ERSÄTT BESLUTAT</span><strong>{activeReplacementCount}</strong><small>explicit valda bilar</small></article>
          </div>

          <div className={styles.layout}>
            <div className={styles.modelTableWrap}>
              <table className={styles.table} style={tableStyle}>
                <thead><tr><th>Modell</th>{data.months.map((month) => <th key={month.period}>{month.label}<small>SALU / BESTÄLLT</small></th>)}<th>Totalt<small>SALU / BESTÄLLT</small></th><th>166</th><th>170</th><th>274</th><th>Ej fastställd</th></tr></thead>
                <tbody>
                  {data.models.map((model) => <tr key={model.key} className={selectedModel === model.key ? styles.selected : undefined} onClick={() => setSelectedModel(model.key)}>
                    <td><button type="button" className={styles.modelButton}>{model.label}</button></td>
                    {model.monthCounts.map((count, index) => <td key={index}><div className={styles.pairedValue}><strong>{count}</strong><span>{model.orderedMonthCounts[index] ?? 0}</span></div></td>)}
                    <td><div className={styles.pairedValue}><strong>{model.total}</strong><span>{model.orderedTotal}</span></div></td>
                    <td>{model.stationCounts['166'] ?? 0}</td><td>{model.stationCounts['170'] ?? 0}</td><td>{model.stationCounts['274'] ?? 0}</td><td>{model.stationCounts.EJ_FASTSTALLD ?? 0}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>

            <aside className={styles.detail}>
              <div className={styles.detailHead}><strong>{selectedModel ? data.models.find((model) => model.key === selectedModel)?.label : 'Välj modell'}</strong><span>{detailItems.length ? `${detailItems.length} bilar` : 'HELHET → MODELL → BIL'}</span></div>
              {selectedModel ? <div className={styles.vehicleList}>{detailItems.map((item) => {
                const decision = decisions[item.regnr];
                const active = decision?.decision_status === 'REPLACE';
                const disabled = decisionSaving === item.regnr || decisionStorageReady === false;
                return <div key={`${item.regnr}-${item.saluDate}`} className={`${styles.vehicleRow} ${active ? styles.replacementSelected : ''}`}>
                  <div><strong>{item.regnr}</strong><span>{item.model}</span></div>
                  <div><strong>{item.saluDate}</strong><span>{item.stationCode ?? 'Station ej fastställd'}{item.stationName ? ` · ${item.stationName}` : ''}</span></div>
                  <button
                    type="button"
                    className={active ? styles.replaceActive : styles.replaceButton}
                    disabled={disabled}
                    onClick={() => void setReplacementDecision(item, active ? 'CANCELLED' : 'REPLACE')}
                    title={decisionStorageReady === false ? 'Beslutslagret är inte tillgängligt' : active ? 'Ta bort ersättningsbeslut' : 'Markera bilen för ersättning'}
                  >
                    {decisionSaving === item.regnr ? 'SPARAR…' : active ? 'ERSÄTTS ✓' : 'ERSÄTT'}
                  </button>
                </div>;
              })}</div> : <div className={styles.empty}>Klicka på en modell för att se vilka bilar som bygger SALU-helheten.</div>}
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}
