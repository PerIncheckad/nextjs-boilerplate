'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './salu-overview.module.css';

type MonthRow = { index: number; period: string; label: string; count: number; cumulativeCount: number };
type ModelRow = { key: string; label: string; monthCounts: number[]; stationCounts: Record<string, number>; total: number };
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

function currentPeriod() { return new Date().toISOString().slice(0, 7); }

export default function SaluOverview() {
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState<Payload | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, DecisionRow>>({});
  const [decisionStorageReady, setDecisionStorageReady] = useState<boolean | null>(null);
  const [decisionSaving, setDecisionSaving] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/planning/salu-overview?period=${encodeURIComponent(period)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? 'Kunde inte läsa SALU-översikten');
        if (!active) return;
        const nextData = body.data as Payload;
        setData(nextData);
        const regnrs = nextData.items.map((item) => item.regnr);
        if (regnrs.length === 0) {
          setDecisions({});
          setDecisionStorageReady(null);
          return;
        }
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

  const changePeriod = (nextPeriod: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    setSelectedModel(null);
    setDecisions({});
    setDecisionStorageReady(null);
    setDecisionNotice(null);
    setPeriod(nextPeriod || currentPeriod());
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
          <p>SALU informerar. Den skapar inte BEHOV, UTÖKNING, MINSKNING eller BESTÄLLT.</p>
        </div>
        <label className={styles.period}><span>Från månad</span><input type="month" value={period} onChange={(event) => changePeriod(event.target.value)} /></label>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {decisionNotice ? <div className={styles.notice}>{decisionNotice}</div> : null}
      {decisionStorageReady === false ? <div className={styles.storageWarning}>ERSÄTT är färdigbyggt i grenen men väntar på databasaktivering. Inget beslut kan sparas förrän den lagringen är godkänd.</div> : null}
      {loading ? <div className={styles.loading}>Läser kommande SALU…</div> : data ? (
        <>
          <div className={styles.horizonGrid}>
            {data.months.map((month) => (
              <article key={month.period} className={styles.horizonCard}>
                <span>{month.index + 1} MÅN</span>
                <strong>{month.cumulativeCount}</strong>
                <small>{month.label} · {month.count} i månaden</small>
              </article>
            ))}
            <article className={styles.horizonCard}><span>HELHET 4 MÅN</span><strong>{data.total}</strong><small>samtliga kommande SALU</small></article>
            <article className={styles.horizonCard}><span>ERSÄTT BESLUTAT</span><strong>{activeReplacementCount}</strong><small>explicit valda bilar</small></article>
          </div>

          <div className={styles.layout}>
            <div className={styles.modelTableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Modell</th>{data.months.map((month) => <th key={month.period}>{month.label}</th>)}<th>Totalt</th><th>166</th><th>170</th><th>274</th><th>Ej fastställd</th></tr></thead>
                <tbody>
                  {data.models.map((model) => <tr key={model.key} className={selectedModel === model.key ? styles.selected : undefined} onClick={() => setSelectedModel(model.key)}>
                    <td><button type="button" className={styles.modelButton}>{model.label}</button></td>
                    {model.monthCounts.map((count, index) => <td key={index}>{count}</td>)}
                    <td><strong>{model.total}</strong></td>
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
                    title={decisionStorageReady === false ? 'Databaslagringen är ännu inte aktiverad' : active ? 'Ta bort ersättningsbeslut' : 'Markera bilen för ersättning'}
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
