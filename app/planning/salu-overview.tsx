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

function currentPeriod() { return new Date().toISOString().slice(0, 7); }

export default function SaluOverview() {
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState<Payload | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    void fetch(`/api/planning/salu-overview?period=${encodeURIComponent(period)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? 'Kunde inte läsa SALU-översikten');
        if (active) setData(body.data as Payload);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Kunde inte läsa SALU-översikten'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period]);

  const detailItems = useMemo(() => {
    if (!data || !selectedModel) return [];
    return data.items.filter((item) => item.modelKey === selectedModel);
  }, [data, selectedModel]);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>SALU / BESLUTSSTÖD</div>
          <h2>Kommande SALU — 1 till 4 månader</h2>
          <p>SALU informerar. Den skapar inte BEHOV, UTÖKNING, MINSKNING eller BESTÄLLT.</p>
        </div>
        <label className={styles.period}><span>Från månad</span><input type="month" value={period} onChange={(event) => setPeriod(event.target.value || currentPeriod())} /></label>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
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
              {selectedModel ? <div className={styles.vehicleList}>{detailItems.map((item) => <div key={`${item.regnr}-${item.saluDate}`} className={styles.vehicleRow}>
                <div><strong>{item.regnr}</strong><span>{item.model}</span></div>
                <div><strong>{item.saluDate}</strong><span>{item.stationCode ?? 'Station ej fastställd'}{item.stationName ? ` · ${item.stationName}` : ''}</span></div>
                <button type="button" disabled title="Ersättningsbeslut byggs i nästa steg">ERSÄTT</button>
              </div>)}</div> : <div className={styles.empty}>Klicka på en modell för att se vilka bilar som bygger SALU-helheten.</div>}
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}
