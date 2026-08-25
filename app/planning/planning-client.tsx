'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './planning.module.css';

const STATIONS = ['166', '170', '274'] as const;
const METRICS = [
  ['salu_count', 'SALU'],
  ['behov_count', 'BEHOV'],
  ['utok_count', 'UTÖK'],
  ['minskning_count', 'MINSKNING'],
  ['ordered_count', 'BESTÄLLT'],
] as const;

type Station = typeof STATIONS[number];
type Metric = typeof METRICS[number][0];
type Counts = Record<Metric, number>;

type ApiCell = Counts & {
  planning_cell_id: string;
  period_code: string;
  model: string;
  station: Station;
  note: string | null;
  updated_at: string;
};

type ModelRow = {
  key: string;
  model: string;
  note: string;
  stations: Record<Station, Counts>;
  dirty: boolean;
};

const emptyCounts = (): Counts => ({
  salu_count: 0,
  behov_count: 0,
  utok_count: 0,
  minskning_count: 0,
  ordered_count: 0,
});

const defaultPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
};

function pivot(cells: ApiCell[]): ModelRow[] {
  const map = new Map<string, ModelRow>();
  for (const cell of cells) {
    const key = cell.model.trim().toUpperCase();
    if (!map.has(key)) {
      map.set(key, {
        key,
        model: cell.model,
        note: cell.note ?? '',
        dirty: false,
        stations: { 166: emptyCounts(), 170: emptyCounts(), 274: emptyCounts() },
      });
    }
    const row = map.get(key)!;
    row.stations[cell.station] = {
      salu_count: cell.salu_count,
      behov_count: cell.behov_count,
      utok_count: cell.utok_count,
      minskning_count: cell.minskning_count,
      ordered_count: cell.ordered_count,
    };
    if (!row.note && cell.note) row.note = cell.note;
  }
  return [...map.values()].sort((a, b) => a.model.localeCompare(b.model, 'sv'));
}

export default function FleetPlanningClient() {
  const initialPeriod = useMemo(defaultPeriod, []);
  const [period, setPeriod] = useState(initialPeriod);
  const [periodInput, setPeriodInput] = useState(initialPeriod);
  const [periods, setPeriods] = useState<string[]>([]);
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPeriod: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/fleet-planning?period=${encodeURIComponent(nextPeriod)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa planeringen');
      setRows(pivot(payload.data as ApiCell[]));
      setPeriods(payload.periods ?? []);
      setPeriod(nextPeriod);
      setPeriodInput(nextPeriod);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa planeringen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch(`/api/fleet-planning?period=${encodeURIComponent(initialPeriod)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa planeringen');
        if (!active) return;
        setRows(pivot(payload.data as ApiCell[]));
        setPeriods(payload.periods ?? []);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa planeringen');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [initialPeriod]);

  const updateCount = (key: string, station: Station, metric: Metric, raw: string) => {
    const value = Math.max(0, Number.parseInt(raw || '0', 10) || 0);
    setRows((current) => current.map((row) => row.key === key
      ? { ...row, dirty: true, stations: { ...row.stations, [station]: { ...row.stations[station], [metric]: value } } }
      : row));
  };

  const updateText = (key: string, field: 'model' | 'note', value: string) => {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value, dirty: true } : row));
  };

  const addRow = () => {
    const key = `new-${crypto.randomUUID()}`;
    setRows((current) => [...current, {
      key,
      model: '',
      note: '',
      dirty: true,
      stations: { 166: emptyCounts(), 170: emptyCounts(), 274: emptyCounts() },
    }]);
  };

  const saveRow = async (row: ModelRow) => {
    const model = row.model.trim();
    if (!model) {
      setError('Modell måste anges innan raden kan sparas.');
      return;
    }
    setSavingKey(row.key);
    setError(null);
    try {
      const payload = STATIONS.map((station) => ({
        period_code: period,
        model,
        station,
        ...row.stations[station],
        note: row.note.trim() || null,
      }));
      const response = await fetch('/api/fleet-planning', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? 'Kunde inte spara planeringen');
      await load(period);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kunde inte spara planeringen');
    } finally {
      setSavingKey(null);
    }
  };

  const totals = useMemo(() => {
    const result = Object.fromEntries(STATIONS.map((station) => [station, emptyCounts()])) as Record<Station, Counts>;
    for (const row of rows) {
      for (const station of STATIONS) {
        for (const [metric] of METRICS) result[station][metric] += row.stations[station][metric];
      }
    }
    return result;
  }, [rows]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>INCHECKAD / VAGNPARKSPLANERING</div>
          <h1>Planering</h1>
          <p>Excel-lik stationsplanering för 166, 170 och 274.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/tower" className={styles.secondaryButton}>Tower</Link>
          <Link href="/garage" className={styles.primaryButton}>Garaget</Link>
        </div>
      </header>

      <section className={styles.periodBar}>
        <label>
          <span>Period</span>
          <input list="planning-periods" value={periodInput} onChange={(event) => setPeriodInput(event.target.value)} />
          <datalist id="planning-periods">{periods.map((value) => <option key={value} value={value} />)}</datalist>
        </label>
        <button type="button" className={styles.secondaryButton} onClick={() => void load(periodInput.trim() || defaultPeriod())}>Öppna period</button>
        <button type="button" className={styles.primaryButton} onClick={addRow}>+ Ny modellrad</button>
        <div className={styles.periodStatus}><span>Aktiv period</span><strong>{period}</strong></div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.gridSection}>
        <div className={styles.gridHeading}>
          <div><h2>Planeringsmatris</h2><p>SALU · BEHOV · UTÖKNING · MINSKNING · BESTÄLLT</p></div>
          <strong>{rows.length} modeller</strong>
        </div>

        {loading ? <div className={styles.empty}>Läser planering…</div> : (
          <div className={styles.tableWrap}>
            <table className={styles.planningTable}>
              <thead>
                <tr>
                  <th rowSpan={2} className={styles.modelColumn}>Modell</th>
                  {METRICS.map(([metric, title]) => <th key={metric} colSpan={3} className={styles.groupHeader}>{title}</th>)}
                  <th rowSpan={2} className={styles.noteColumn}>Kommentar</th>
                  <th rowSpan={2} className={styles.actionColumn}>Spara</th>
                </tr>
                <tr>
                  {METRICS.flatMap(([metric]) => STATIONS.map((station) => <th key={`${metric}-${station}`}>{station}</th>))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className={styles.modelColumn}><input value={row.model} onChange={(event) => updateText(row.key, 'model', event.target.value)} placeholder="Modell" /></td>
                    {METRICS.flatMap(([metric]) => STATIONS.map((station) => (
                      <td key={`${row.key}-${metric}-${station}`} className={styles.numberCell}>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={row.stations[station][metric]}
                          onChange={(event) => updateCount(row.key, station, metric, event.target.value)}
                          aria-label={`${row.model || 'Ny modell'} ${metric} ${station}`}
                        />
                      </td>
                    )))}
                    <td className={styles.noteColumn}><input value={row.note} onChange={(event) => updateText(row.key, 'note', event.target.value)} placeholder="Avrop, avvikelse, kommentar…" /></td>
                    <td className={styles.actionColumn}>
                      <button type="button" className={row.dirty ? styles.saveButtonDirty : styles.saveButton} onClick={() => void saveRow(row)} disabled={savingKey === row.key}>
                        {savingKey === row.key ? 'Sparar…' : row.dirty ? 'Spara*' : 'Spara'}
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <td>TOTALT</td>
                  {METRICS.flatMap(([metric]) => STATIONS.map((station) => <td key={`total-${metric}-${station}`}>{totals[station][metric]}</td>))}
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.explainer}>
        <strong>Systemgräns</strong>
        <p>Planeringen beskriver avsikt och framtida balans. Den skriver inte om Lager 1 och skapar ingen monetär konsekvens. Individuella bilar landar i Garaget.</p>
      </section>
    </main>
  );
}
