'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import styles from './planning.module.css';

const METRICS = [
  ['salu_count', 'SALU'],
  ['behov_count', 'BEHOV'],
  ['utok_count', 'UTÖKNING'],
  ['minskning_count', 'MINSKNING'],
  ['ordered_count', 'BESTÄLLT'],
] as const;

type Metric = typeof METRICS[number][0];
type Counts = Record<Metric, number>;
type PlanningStation = { station_code: string; display_name: string | null; sort_order: number };
type PlanningModel = { model_code: string; display_name: string; sort_order: number };
type ApiCell = Counts & { planning_cell_id: string; period_code: string; model: string; station: string; note: string | null; updated_at: string };
type ModelRow = { key: string; model: string; note: string; stations: Record<string, Counts>; dirty: boolean };
type SheetColumn = { station: string; metric: Metric };
type SortMode = 'MODEL_ASC' | 'MODEL_DESC' | 'BESTALLT_DESC' | 'SALU_DESC';
type DraftEnvelope = { version: 1; savedAt: string; rows: ModelRow[] };

const emptyCounts = (): Counts => ({ salu_count: 0, behov_count: 0, utok_count: 0, minskning_count: 0, ordered_count: 0 });
const defaultPeriod = () => new Date().toISOString().slice(0, 7);
const draftKey = (period: string) => `incheckad-planning-draft:${period}`;

function pivot(cells: ApiCell[], stations: PlanningStation[]): ModelRow[] {
  const stationTemplate = () => Object.fromEntries(stations.map((station) => [station.station_code, emptyCounts()]));
  const map = new Map<string, ModelRow>();
  for (const cell of cells) {
    const key = cell.model.trim().toUpperCase();
    if (!map.has(key)) map.set(key, { key, model: cell.model, note: cell.note ?? '', dirty: false, stations: stationTemplate() });
    const row = map.get(key)!;
    row.stations[cell.station] = { salu_count: cell.salu_count, behov_count: cell.behov_count, utok_count: cell.utok_count, minskning_count: cell.minskning_count, ordered_count: cell.ordered_count };
    if (!row.note && cell.note) row.note = cell.note;
  }
  return [...map.values()];
}

function normalizedCount(raw: string): number { return Math.max(0, Number.parseInt(raw.trim() || '0', 10) || 0); }
function rowMetricTotal(row: ModelRow, stations: PlanningStation[], metric: Metric) { return stations.reduce((sum, station) => sum + (row.stations[station.station_code] ?? emptyCounts())[metric], 0); }
function safeStoredCount(value: unknown): number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0; }
function safeStoredCounts(value: unknown): Counts {
  const source = value && typeof value === 'object' ? value as Partial<Record<Metric, unknown>> : {};
  return {
    salu_count: safeStoredCount(source.salu_count),
    behov_count: safeStoredCount(source.behov_count),
    utok_count: safeStoredCount(source.utok_count),
    minskning_count: safeStoredCount(source.minskning_count),
    ordered_count: safeStoredCount(source.ordered_count),
  };
}

function restoreDraft(period: string, serverRows: ModelRow[], stations: PlanningStation[]) {
  if (typeof window === 'undefined') return { rows: serverRows, restored: 0 };
  try {
    const raw = window.localStorage.getItem(draftKey(period));
    if (!raw) return { rows: serverRows, restored: 0 };
    const parsed = JSON.parse(raw) as Partial<DraftEnvelope>;
    if (parsed.version !== 1 || !Array.isArray(parsed.rows)) return { rows: serverRows, restored: 0 };

    const rows = [...serverRows];
    let restored = 0;
    parsed.rows.forEach((candidate, index) => {
      if (!candidate || typeof candidate !== 'object') return;
      const key = typeof candidate.key === 'string' && candidate.key ? candidate.key : `restored-${index}`;
      const model = typeof candidate.model === 'string' ? candidate.model : '';
      const note = typeof candidate.note === 'string' ? candidate.note : '';
      const candidateStations = candidate.stations && typeof candidate.stations === 'object' ? candidate.stations : {};
      const draftRow: ModelRow = {
        key,
        model,
        note,
        dirty: true,
        stations: Object.fromEntries(stations.map((station) => [station.station_code, safeStoredCounts(candidateStations[station.station_code])])),
      };
      const existingIndex = rows.findIndex((row) => row.key === key);
      if (existingIndex >= 0) rows[existingIndex] = draftRow;
      else rows.push(draftRow);
      restored += 1;
    });
    return { rows, restored };
  } catch {
    return { rows: serverRows, restored: 0 };
  }
}

export default function FleetPlanningClient() {
  const [initialPeriod] = useState(() => defaultPeriod());
  const [period, setPeriod] = useState(initialPeriod);
  const [periodInput, setPeriodInput] = useState(initialPeriod);
  const [periods, setPeriods] = useState<string[]>([]);
  const [stations, setStations] = useState<PlanningStation[]>([]);
  const [models, setModels] = useState<PlanningModel[]>([]);
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('MODEL_ASC');
  const [loading, setLoading] = useState(true);
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const sheetColumns = useMemo<SheetColumn[]>(() => METRICS.flatMap(([metric]) => stations.map(({ station_code }) => ({ metric, station: station_code }))), [stations]);
  const visibleRows = useMemo(() => [...rows].sort((a, b) => {
    if (sortMode === 'MODEL_DESC') return b.model.localeCompare(a.model, 'sv');
    if (sortMode === 'BESTALLT_DESC') return rowMetricTotal(b, stations, 'ordered_count') - rowMetricTotal(a, stations, 'ordered_count') || a.model.localeCompare(b.model, 'sv');
    if (sortMode === 'SALU_DESC') return rowMetricTotal(b, stations, 'salu_count') - rowMetricTotal(a, stations, 'salu_count') || a.model.localeCompare(b.model, 'sv');
    return a.model.localeCompare(b.model, 'sv');
  }), [rows, sortMode, stations]);
  const dirtyRows = useMemo(() => rows.filter((row) => row.dirty), [rows]);

  const applyPayload = useCallback((payload: { data?: ApiCell[]; periods?: string[]; stations?: PlanningStation[]; models?: PlanningModel[] }, nextPeriod: string, recoverDraft = true) => {
    const nextStations = payload.stations ?? [];
    const serverRows = pivot(payload.data ?? [], nextStations);
    const restored = recoverDraft ? restoreDraft(nextPeriod, serverRows, nextStations) : { rows: serverRows, restored: 0 };
    setStations(nextStations);
    setModels(payload.models ?? []);
    setRows(restored.rows);
    setPeriods(payload.periods ?? []);
    setPeriod(nextPeriod);
    setPeriodInput(nextPeriod);
    setLoadedPeriod(nextPeriod);
    setDraftNotice(restored.restored > 0 ? `Återställde ${restored.restored} osparade ${restored.restored === 1 ? 'rad' : 'rader'} från denna webbläsare.` : null);
  }, []);

  const load = useCallback(async (nextPeriod: string, recoverDraft = true) => {
    setLoading(true); setError(null); setSaveStatus(null);
    try {
      const response = await fetch(`/api/fleet-planning?period=${encodeURIComponent(nextPeriod)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa planeringen');
      applyPayload(payload, nextPeriod, recoverDraft);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa planeringen'); }
    finally { setLoading(false); }
  }, [applyPayload]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/fleet-planning?period=${encodeURIComponent(initialPeriod)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa planeringen');
        if (!active) return;
        applyPayload(payload, initialPeriod);
        setError(null);
      })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa planeringen'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyPayload, initialPeriod]);

  useEffect(() => {
    if (loadedPeriod !== period) return;
    const timer = window.setTimeout(() => {
      const unsaved = rows.filter((row) => row.dirty);
      if (unsaved.length === 0) {
        window.localStorage.removeItem(draftKey(period));
        return;
      }
      const envelope: DraftEnvelope = { version: 1, savedAt: new Date().toISOString(), rows: unsaved };
      window.localStorage.setItem(draftKey(period), JSON.stringify(envelope));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loadedPeriod, period, rows]);

  useEffect(() => {
    if (dirtyRows.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyRows.length]);

  const markChanged = () => { setSaveStatus(null); setDraftNotice(null); };
  const updateCount = (key: string, station: string, metric: Metric, raw: string) => {
    const value = normalizedCount(raw);
    markChanged();
    setRows((current) => current.map((row) => row.key === key ? { ...row, dirty: true, stations: { ...row.stations, [station]: { ...(row.stations[station] ?? emptyCounts()), [metric]: value } } } : row));
  };
  const updateText = (key: string, field: 'model' | 'note', value: string) => {
    markChanged();
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value, dirty: true } : row));
  };
  const addRow = () => {
    const key = `new-${crypto.randomUUID()}`;
    markChanged();
    setRows((current) => [...current, { key, model: '', note: '', dirty: true, stations: Object.fromEntries(stations.map((station) => [station.station_code, emptyCounts()])) }]);
    requestAnimationFrame(() => { const inputs = document.querySelectorAll<HTMLInputElement>('input[data-model-cell="true"]'); inputs.item(inputs.length - 1)?.focus(); });
  };

  const payloadForRow = (row: ModelRow) => {
    const model = row.model.trim();
    return stations.map(({ station_code }) => ({ period_code: period, model, station: station_code, ...(row.stations[station_code] ?? emptyCounts()), note: row.note.trim() || null }));
  };

  const saveRow = async (row: ModelRow) => {
    const model = row.model.trim();
    if (!model) return setError('Modell måste anges innan raden kan sparas.');
    if (stations.length === 0) return setError('Inga aktiva planeringsstationer finns.');
    setSavingKey(row.key); setError(null); setSaveStatus(null);
    try {
      const response = await fetch('/api/fleet-planning', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadForRow(row)) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? 'Kunde inte spara planeringen');
      setRows((current) => current.map((value) => value.key === row.key ? { ...value, dirty: false } : value));
      setSaveStatus(`${model} sparad.`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Kunde inte spara planeringen'); }
    finally { setSavingKey(null); }
  };

  const saveAll = async () => {
    if (dirtyRows.length === 0) return;
    if (stations.length === 0) return setError('Inga aktiva planeringsstationer finns.');
    const invalid = dirtyRows.find((row) => !row.model.trim());
    if (invalid) return setError('Alla osparade rader måste ha en modell innan du kan spara allt.');

    setSavingAll(true); setError(null); setSaveStatus(null);
    try {
      const payload = dirtyRows.flatMap(payloadForRow);
      for (let index = 0; index < payload.length; index += 450) {
        const response = await fetch('/api/fleet-planning', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload.slice(index, index + 450)) });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? 'Kunde inte spara planeringen');
      }
      window.localStorage.removeItem(draftKey(period));
      setRows((current) => current.map((row) => row.dirty ? { ...row, dirty: false } : row));
      const savedCount = dirtyRows.length;
      await load(period, false);
      setSaveStatus(`${savedCount} ${savedCount === 1 ? 'rad' : 'rader'} sparade.`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Kunde inte spara planeringen'); }
    finally { setSavingAll(false); }
  };

  const moveSheetFocus = (event: KeyboardEvent<HTMLInputElement>, direction: number) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const cells = [...document.querySelectorAll<HTMLInputElement>('input[data-sheet-cell="true"]')];
    const index = cells.indexOf(event.currentTarget);
    cells[index + direction]?.focus(); cells[index + direction]?.select();
  };
  const pasteSheet = (rowIndex: number, columnIndex: number, event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault(); markChanged();
    const matrix = text.replace(/\r/g, '').split('\n').filter((line, index, all) => line.length > 0 || index < all.length - 1).map((line) => line.split('\t'));
    setRows((current) => {
      const next = current.map((row) => ({ ...row, stations: { ...row.stations } }));
      matrix.forEach((pasteRow, rowOffset) => {
        const targetVisible = visibleRows[rowIndex + rowOffset];
        if (!targetVisible) return;
        const targetRow = next.find((row) => row.key === targetVisible.key);
        if (!targetRow) return;
        pasteRow.forEach((raw, columnOffset) => {
          const column = sheetColumns[columnIndex + columnOffset]; if (!column) return;
          targetRow.stations[column.station] = { ...(targetRow.stations[column.station] ?? emptyCounts()), [column.metric]: normalizedCount(raw) };
          targetRow.dirty = true;
        });
      });
      return next;
    });
  };
  const totals = useMemo(() => {
    const result: Record<string, Counts> = Object.fromEntries(stations.map(({ station_code }) => [station_code, emptyCounts()]));
    for (const row of rows) for (const { station_code } of stations) for (const [metric] of METRICS) result[station_code][metric] += (row.stations[station_code] ?? emptyCounts())[metric];
    return result;
  }, [rows, stations]);
  const print = () => window.print();

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><div className={styles.eyebrow}>INCHECKAD / VAGNPARKSPLANERING</div><h1>Planering</h1><p>Månadsvis arbetsmatris för vagnparksplanering.</p></div>
        <div className={styles.headerActions}><Link href="/tower" className={styles.secondaryButton}>Tower</Link><Link href="/garage" className={styles.primaryButton}>Garaget</Link></div>
      </header>

      <section className={styles.toolbar}>
        <label className={styles.periodControl}><span>Månad</span><input type="month" value={periodInput} onChange={(event) => setPeriodInput(event.target.value)} /></label>
        <button type="button" className={styles.secondaryButton} onClick={() => void load(periodInput || defaultPeriod())}>Öppna</button>
        <button type="button" className={styles.primaryButton} onClick={addRow} disabled={stations.length === 0}>+ Rad</button>
        <button type="button" className={dirtyRows.length > 0 ? styles.saveAllButtonDirty : styles.saveAllButton} onClick={() => void saveAll()} disabled={dirtyRows.length === 0 || savingAll}>{savingAll ? 'Sparar…' : dirtyRows.length > 0 ? `Spara alla (${dirtyRows.length})` : 'Allt sparat'}</button>
        <label className={styles.periodControl}><span>Sortera</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="MODEL_ASC">Modell A–Ö</option><option value="MODEL_DESC">Modell Ö–A</option><option value="BESTALLT_DESC">BESTÄLLT flest</option><option value="SALU_DESC">SALU flest</option></select></label>
        <button type="button" className={styles.secondaryButton} onClick={print}>Skriv ut</button>
        <button type="button" className={styles.secondaryButton} onClick={print} title="Välj Spara som PDF i utskriftsdialogen">PDF</button>
        <div className={styles.sheetHint}>{models.length} modeller i registret · Enter = nästa cell · klistra in från Excel</div>
        <div className={styles.periodStatus}><span>Aktiv månad</span><strong>{period}</strong></div>
      </section>

      <datalist id="planning-models">{models.map((model) => <option key={model.model_code} value={model.display_name} />)}</datalist>
      <datalist id="planning-periods">{periods.map((value) => <option key={value} value={value} />)}</datalist>
      {draftNotice ? <div className={styles.info}>{draftNotice}</div> : null}
      {saveStatus ? <div className={styles.success}>{saveStatus}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.gridSection}>
        <div className={styles.gridHeading}><div><strong>PLANERINGSMATRIS — {period}</strong><span>SALU · BEHOV · UTÖKNING · MINSKNING · BESTÄLLT</span></div><strong>{dirtyRows.length > 0 ? `${dirtyRows.length} osparade · ` : ''}{rows.length} modeller · {stations.length} stationer</strong></div>
        {loading ? <div className={styles.empty}>Läser planering…</div> : stations.length === 0 ? <div className={styles.empty}>Inga aktiva planeringsstationer finns.</div> : (
          <div className={styles.tableWrap}><table className={styles.planningTable}>
            <thead><tr><th rowSpan={2} className={styles.modelColumn}>Modell</th>{METRICS.map(([metric, title]) => <th key={metric} colSpan={stations.length} className={styles.groupHeader}>{title}</th>)}<th rowSpan={2} className={styles.noteColumn}>Kommentar</th><th rowSpan={2} className={styles.actionColumn}>SPARA</th></tr>
            <tr>{METRICS.flatMap(([metric]) => stations.map((station) => <th key={`${metric}-${station.station_code}`}>{station.display_name || station.station_code}</th>))}</tr></thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => <tr key={row.key} className={row.dirty ? styles.dirtyRow : undefined}>
                <td className={styles.modelColumn}><input data-model-cell="true" list="planning-models" value={row.model} onChange={(event) => updateText(row.key, 'model', event.target.value)} placeholder="Välj eller skriv modell" autoComplete="off" /></td>
                {sheetColumns.map(({ metric, station }, columnIndex) => <td key={`${row.key}-${metric}-${station}`} className={styles.numberCell}><input data-sheet-cell="true" type="number" min={0} inputMode="numeric" value={(row.stations[station] ?? emptyCounts())[metric]} onChange={(event) => updateCount(row.key, station, metric, event.target.value)} onKeyDown={(event) => moveSheetFocus(event, event.shiftKey ? -1 : 1)} onPaste={(event) => pasteSheet(rowIndex, columnIndex, event)} onFocus={(event) => event.currentTarget.select()} aria-label={`${row.model || 'Ny modell'} ${metric} ${station}`} /></td>)}
                <td className={styles.noteColumn}><input value={row.note} onChange={(event) => updateText(row.key, 'note', event.target.value)} placeholder="Avrop, avvikelse, kommentar…" /></td>
                <td className={styles.actionColumn}><button type="button" className={row.dirty ? styles.saveButtonDirty : styles.saveButton} onClick={() => void saveRow(row)} disabled={savingKey === row.key || !row.dirty}>{savingKey === row.key ? '…' : row.dirty ? 'Spara*' : 'Sparad'}</button></td>
              </tr>)}
              <tr className={styles.totalRow}><td className={styles.modelColumn}>TOTALT</td>{sheetColumns.map(({ metric, station }) => <td key={`total-${metric}-${station}`}>{totals[station]?.[metric] ?? 0}</td>)}<td /><td className={styles.actionColumn} /></tr>
            </tbody>
          </table></div>
        )}
      </section>
    </main>
  );
}
