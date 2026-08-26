'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import styles from './planning.module.css';

const DECISIONS = [
  ['behov_count', 'BEHOV'],
  ['utok_count', 'UTÖKNING'],
  ['minskning_count', 'MINSKNING'],
  ['ordered_count', 'BESTÄLLT'],
] as const;

type DecisionMetric = typeof DECISIONS[number][0];
type Metric = DecisionMetric | 'salu_count';
type Counts = Record<Metric, number>;
type PlanningStation = { station_code: string; display_name: string | null; sort_order: number };
type PlanningModel = { model_code: string; display_name: string; sort_order: number };
type ApiCell = Counts & { planning_cell_id: string; period_code: string; model: string; station: string; note: string | null; updated_at: string };
type ModelRow = { key: string; model: string; note: string; stations: Record<string, Counts>; dirty: boolean };
type DraftEnvelope = { version: 2; savedAt: string; rows: ModelRow[] };

const emptyCounts = (): Counts => ({ salu_count: 0, behov_count: 0, utok_count: 0, minskning_count: 0, ordered_count: 0 });
const defaultPeriod = () => new Date().toISOString().slice(0, 7);
const draftKey = (period: string) => `incheckad-planning-v2-draft:${period}`;
const normalizedCount = (raw: string) => Math.max(0, Number.parseInt(raw.trim() || '0', 10) || 0);

function pivot(cells: ApiCell[], stations: PlanningStation[]): ModelRow[] {
  const stationTemplate = () => Object.fromEntries(stations.map((station) => [station.station_code, emptyCounts()]));
  const map = new Map<string, ModelRow>();
  for (const cell of cells) {
    const key = cell.model.trim().toUpperCase();
    if (!map.has(key)) map.set(key, { key, model: cell.model, note: cell.note ?? '', dirty: false, stations: stationTemplate() });
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
  return [...map.values()];
}

function safeCounts(value: unknown): Counts {
  const source = value && typeof value === 'object' ? value as Partial<Record<Metric, unknown>> : {};
  const read = (key: Metric) => typeof source[key] === 'number' && Number.isInteger(source[key]) && (source[key] as number) >= 0 ? source[key] as number : 0;
  return { salu_count: read('salu_count'), behov_count: read('behov_count'), utok_count: read('utok_count'), minskning_count: read('minskning_count'), ordered_count: read('ordered_count') };
}

function restoreDraft(period: string, serverRows: ModelRow[], stations: PlanningStation[]) {
  if (typeof window === 'undefined') return { rows: serverRows, restored: 0 };
  try {
    const raw = window.localStorage.getItem(draftKey(period));
    if (!raw) return { rows: serverRows, restored: 0 };
    const parsed = JSON.parse(raw) as Partial<DraftEnvelope>;
    if (parsed.version !== 2 || !Array.isArray(parsed.rows)) return { rows: serverRows, restored: 0 };
    const rows = [...serverRows];
    for (const candidate of parsed.rows) {
      if (!candidate?.key || !candidate.model) continue;
      const draftRow: ModelRow = {
        key: candidate.key,
        model: candidate.model,
        note: typeof candidate.note === 'string' ? candidate.note : '',
        dirty: true,
        stations: Object.fromEntries(stations.map((station) => [station.station_code, safeCounts(candidate.stations?.[station.station_code])])),
      };
      const index = rows.findIndex((row) => row.key === draftRow.key);
      if (index >= 0) rows[index] = draftRow; else rows.push(draftRow);
    }
    return { rows, restored: parsed.rows.length };
  } catch { return { rows: serverRows, restored: 0 }; }
}

export default function FleetPlanningClient() {
  const [initialPeriod] = useState(defaultPeriod);
  const [period, setPeriod] = useState(initialPeriod);
  const [periodInput, setPeriodInput] = useState(initialPeriod);
  const [metric, setMetric] = useState<DecisionMetric>('behov_count');
  const [stations, setStations] = useState<PlanningStation[]>([]);
  const [models, setModels] = useState<PlanningModel[]>([]);
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const visibleRows = useMemo(() => [...rows].sort((a, b) => a.model.localeCompare(b.model, 'sv')), [rows]);
  const dirtyRows = useMemo(() => rows.filter((row) => row.dirty), [rows]);
  const metricLabel = DECISIONS.find(([key]) => key === metric)?.[1] ?? 'BEHOV';
  const totalForRow = (row: ModelRow) => stations.reduce((sum, station) => sum + (row.stations[station.station_code] ?? emptyCounts())[metric], 0);
  const stationTotals = useMemo(() => Object.fromEntries(stations.map((station) => [station.station_code, rows.reduce((sum, row) => sum + (row.stations[station.station_code] ?? emptyCounts())[metric], 0)])), [metric, rows, stations]);
  const grandTotal = useMemo(() => Object.values(stationTotals).reduce((sum, value) => sum + value, 0), [stationTotals]);

  const applyPayload = useCallback((payload: { data?: ApiCell[]; stations?: PlanningStation[]; models?: PlanningModel[] }, nextPeriod: string, recover = true) => {
    const nextStations = payload.stations ?? [];
    const serverRows = pivot(payload.data ?? [], nextStations);
    const restored = recover ? restoreDraft(nextPeriod, serverRows, nextStations) : { rows: serverRows, restored: 0 };
    setStations(nextStations);
    setModels(payload.models ?? []);
    setRows(restored.rows);
    setPeriod(nextPeriod);
    setPeriodInput(nextPeriod);
    setDraftNotice(restored.restored ? `Återställde ${restored.restored} osparade rader.` : null);
  }, []);

  const load = useCallback(async (nextPeriod: string, recover = true) => {
    setLoading(true); setError(null); setStatus(null);
    try {
      const response = await fetch(`/api/fleet-planning?period=${encodeURIComponent(nextPeriod)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa planeringen');
      applyPayload(payload, nextPeriod, recover);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunde inte läsa planeringen'); }
    finally { setLoading(false); }
  }, [applyPayload]);

  useEffect(() => { void load(initialPeriod); }, [initialPeriod, load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!dirtyRows.length) { window.localStorage.removeItem(draftKey(period)); return; }
      const envelope: DraftEnvelope = { version: 2, savedAt: new Date().toISOString(), rows: dirtyRows };
      window.localStorage.setItem(draftKey(period), JSON.stringify(envelope));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [dirtyRows, period]);

  useEffect(() => {
    if (!dirtyRows.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyRows.length]);

  const updateCount = (key: string, stationCode: string, raw: string) => {
    const value = normalizedCount(raw);
    setStatus(null); setDraftNotice(null);
    setRows((current) => current.map((row) => row.key === key ? {
      ...row,
      dirty: true,
      stations: { ...row.stations, [stationCode]: { ...(row.stations[stationCode] ?? emptyCounts()), [metric]: value } },
    } : row));
  };

  const updateNote = (key: string, value: string) => {
    setStatus(null); setDraftNotice(null);
    setRows((current) => current.map((row) => row.key === key ? { ...row, note: value, dirty: true } : row));
  };

  const payloadForRow = (row: ModelRow) => stations.map((station) => ({
    period_code: period,
    model: row.model,
    station: station.station_code,
    ...(row.stations[station.station_code] ?? emptyCounts()),
    note: row.note.trim() || null,
  }));

  const saveRow = async (row: ModelRow) => {
    setSavingKey(row.key); setError(null); setStatus(null);
    try {
      const response = await fetch('/api/fleet-planning', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadForRow(row)) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? 'Kunde inte spara planeringen');
      setRows((current) => current.map((item) => item.key === row.key ? { ...item, dirty: false } : item));
      setStatus(`${row.model} sparad.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunde inte spara planeringen'); }
    finally { setSavingKey(null); }
  };

  const saveAll = async () => {
    if (!dirtyRows.length) return;
    setSavingAll(true); setError(null); setStatus(null);
    try {
      const payload = dirtyRows.flatMap(payloadForRow);
      for (let index = 0; index < payload.length; index += 450) {
        const response = await fetch('/api/fleet-planning', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload.slice(index, index + 450)) });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? 'Kunde inte spara planeringen');
      }
      window.localStorage.removeItem(draftKey(period));
      const count = dirtyRows.length;
      await load(period, false);
      setStatus(`${count} ${count === 1 ? 'rad' : 'rader'} sparade.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunde inte spara planeringen'); }
    finally { setSavingAll(false); }
  };

  const moveFocus = (event: KeyboardEvent<HTMLInputElement>, direction: number) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const cells = [...document.querySelectorAll<HTMLInputElement>('input[data-planning-cell="true"]')];
    const index = cells.indexOf(event.currentTarget);
    cells[index + direction]?.focus(); cells[index + direction]?.select();
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><div className={styles.eyebrow}>INCHECKAD / VAGNPARKSPLANERING</div><h1>Planering</h1><p>Verksamhetens beslut. SALU ovanför är endast beslutsstöd.</p></div>
        <div className={styles.headerActions}><Link href="/tower" className={styles.secondaryButton}>Tower</Link><Link href="/garage" className={styles.primaryButton}>Garaget</Link></div>
      </header>

      <section className={styles.toolbar}>
        <label className={styles.periodControl}><span>Månad</span><input type="month" value={periodInput} onChange={(event) => setPeriodInput(event.target.value)} /></label>
        <button type="button" className={styles.secondaryButton} onClick={() => void load(periodInput || defaultPeriod())}>Öppna</button>
        <div className={styles.decisionTabs} role="tablist" aria-label="Planeringsbeslut">
          {DECISIONS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={metric === key} className={metric === key ? styles.decisionTabActive : styles.decisionTab} onClick={() => setMetric(key)}>{label}</button>)}
        </div>
        <button type="button" className={dirtyRows.length ? styles.saveAllButtonDirty : styles.saveAllButton} onClick={() => void saveAll()} disabled={!dirtyRows.length || savingAll}>{savingAll ? 'Sparar…' : dirtyRows.length ? `Spara alla (${dirtyRows.length})` : 'Allt sparat'}</button>
        <div className={styles.sheetHint}>{models.length} modeller · Enter = nästa cell</div>
        <div className={styles.periodStatus}><span>Aktiv månad</span><strong>{period}</strong></div>
      </section>

      {draftNotice ? <div className={styles.info}>{draftNotice}</div> : null}
      {status ? <div className={styles.success}>{status}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.gridSection}>
        <div className={styles.gridHeading}><div><strong>{metricLabel} — {period}</strong><span>Modell | stationer | totalt</span></div><strong>{dirtyRows.length ? `${dirtyRows.length} osparade · ` : ''}{rows.length} modeller</strong></div>
        {loading ? <div className={styles.empty}>Läser planering…</div> : stations.length === 0 ? <div className={styles.empty}>Inga aktiva planeringsstationer finns.</div> : (
          <div className={styles.tableWrap}><table className={styles.simplePlanningTable}>
            <thead><tr><th className={styles.modelColumn}>Modell</th>{stations.map((station) => <th key={station.station_code}>{station.station_code}<small>{station.display_name && station.display_name !== station.station_code ? station.display_name : ''}</small></th>)}<th>Totalt</th><th className={styles.noteColumn}>Kommentar</th><th className={styles.actionColumn}>Spara</th></tr></thead>
            <tbody>
              {visibleRows.map((row) => <tr key={row.key} className={row.dirty ? styles.dirtyRow : undefined}>
                <td className={styles.modelColumn}><strong>{row.model}</strong></td>
                {stations.map((station) => <td key={`${row.key}-${station.station_code}`} className={styles.numberCell}><input data-planning-cell="true" type="number" min={0} inputMode="numeric" value={(row.stations[station.station_code] ?? emptyCounts())[metric]} onChange={(event) => updateCount(row.key, station.station_code, event.target.value)} onKeyDown={(event) => moveFocus(event, event.shiftKey ? -1 : 1)} onFocus={(event) => event.currentTarget.select()} aria-label={`${row.model} ${metricLabel} ${station.station_code}`} /></td>)}
                <td className={styles.rowTotal}>{totalForRow(row)}</td>
                <td className={styles.noteColumn}><input value={row.note} onChange={(event) => updateNote(row.key, event.target.value)} placeholder="Kommentar…" /></td>
                <td className={styles.actionColumn}><button type="button" className={row.dirty ? styles.saveButtonDirty : styles.saveButton} onClick={() => void saveRow(row)} disabled={savingKey === row.key || !row.dirty}>{savingKey === row.key ? '…' : row.dirty ? 'Spara*' : 'Sparad'}</button></td>
              </tr>)}
              <tr className={styles.totalRow}><td className={styles.modelColumn}>TOTALT</td>{stations.map((station) => <td key={`total-${station.station_code}`}>{stationTotals[station.station_code] ?? 0}</td>)}<td className={styles.rowTotal}>{grandTotal}</td><td /><td /></tr>
            </tbody>
          </table></div>
        )}
      </section>
    </main>
  );
}
