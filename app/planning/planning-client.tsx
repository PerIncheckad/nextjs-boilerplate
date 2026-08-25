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
type ApiCell = Counts & {
  planning_cell_id: string;
  period_code: string;
  model: string;
  station: string;
  note: string | null;
  updated_at: string;
};
type ModelRow = {
  key: string;
  model: string;
  note: string;
  stations: Record<string, Counts>;
  dirty: boolean;
};

type SheetColumn = { station: string; metric: Metric };

const emptyCounts = (): Counts => ({ salu_count: 0, behov_count: 0, utok_count: 0, minskning_count: 0, ordered_count: 0 });
const defaultPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
};

function pivot(cells: ApiCell[], stations: PlanningStation[]): ModelRow[] {
  const stationTemplate = () => Object.fromEntries(stations.map((station) => [station.station_code, emptyCounts()]));
  const map = new Map<string, ModelRow>();
  for (const cell of cells) {
    const key = cell.model.trim().toUpperCase();
    if (!map.has(key)) {
      map.set(key, { key, model: cell.model, note: cell.note ?? '', dirty: false, stations: stationTemplate() });
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

function normalizedCount(raw: string): number {
  return Math.max(0, Number.parseInt(raw.trim() || '0', 10) || 0);
}

export default function FleetPlanningClient() {
  const [initialPeriod] = useState(() => defaultPeriod());
  const [period, setPeriod] = useState(initialPeriod);
  const [periodInput, setPeriodInput] = useState(initialPeriod);
  const [periods, setPeriods] = useState<string[]>([]);
  const [stations, setStations] = useState<PlanningStation[]>([]);
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sheetColumns = useMemo<SheetColumn[]>(() => METRICS.flatMap(([metric]) => stations.map(({ station_code }) => ({ metric, station: station_code }))), [stations]);

  const applyPayload = useCallback((payload: { data?: ApiCell[]; periods?: string[]; stations?: PlanningStation[] }, nextPeriod: string) => {
    const nextStations = payload.stations ?? [];
    setStations(nextStations);
    setRows(pivot(payload.data ?? [], nextStations));
    setPeriods(payload.periods ?? []);
    setPeriod(nextPeriod);
    setPeriodInput(nextPeriod);
  }, []);

  const load = useCallback(async (nextPeriod: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/fleet-planning?period=${encodeURIComponent(nextPeriod)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa planeringen');
      applyPayload(payload, nextPeriod);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa planeringen');
    } finally {
      setLoading(false);
    }
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

  const updateCount = (key: string, station: string, metric: Metric, raw: string) => {
    const value = normalizedCount(raw);
    setRows((current) => current.map((row) => row.key === key
      ? { ...row, dirty: true, stations: { ...row.stations, [station]: { ...(row.stations[station] ?? emptyCounts()), [metric]: value } } }
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
      stations: Object.fromEntries(stations.map((station) => [station.station_code, emptyCounts()])),
    }]);
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('input[data-model-cell="true"]');
      inputs.item(inputs.length - 1)?.focus();
    });
  };

  const saveRow = async (row: ModelRow) => {
    const model = row.model.trim();
    if (!model) return setError('Modell måste anges innan raden kan sparas.');
    if (stations.length === 0) return setError('Inga aktiva planeringsstationer finns.');
    setSavingKey(row.key);
    setError(null);
    try {
      const payload = stations.map(({ station_code }) => ({
        period_code: period,
        model,
        station: station_code,
        ...(row.stations[station_code] ?? emptyCounts()),
        note: row.note.trim() || null,
      }));
      const response = await fetch('/api/fleet-planning', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? 'Kunde inte spara planeringen');
      await load(period);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kunde inte spara planeringen');
    } finally {
      setSavingKey(null);
    }
  };

  const moveSheetFocus = (event: KeyboardEvent<HTMLInputElement>, direction: number) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const cells = [...document.querySelectorAll<HTMLInputElement>('input[data-sheet-cell="true"]')];
    const index = cells.indexOf(event.currentTarget);
    cells[index + direction]?.focus();
    cells[index + direction]?.select();
  };

  const pasteSheet = (rowIndex: number, columnIndex: number, event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, '').split('\n').filter((line, index, all) => line.length > 0 || index < all.length - 1).map((line) => line.split('\t'));
    setRows((current) => {
      const next = current.map((row) => ({ ...row, stations: { ...row.stations } }));
      matrix.forEach((pasteRow, rowOffset) => {
        const targetRow = next[rowIndex + rowOffset];
        if (!targetRow) return;
        pasteRow.forEach((raw, columnOffset) => {
          const column = sheetColumns[columnIndex + columnOffset];
          if (!column) return;
          targetRow.stations[column.station] = {
            ...(targetRow.stations[column.station] ?? emptyCounts()),
            [column.metric]: normalizedCount(raw),
          };
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

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>INCHECKAD / VAGNPARKSPLANERING</div>
          <h1>Planering</h1>
          <p>Arbetsmatris för vagnparksplanering.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/tower" className={styles.secondaryButton}>Tower</Link>
          <Link href="/garage" className={styles.primaryButton}>Garaget</Link>
        </div>
      </header>

      <section className={styles.toolbar}>
        <label className={styles.periodControl}>
          <span>Period</span>
          <input list="planning-periods" value={periodInput} onChange={(event) => setPeriodInput(event.target.value)} />
          <datalist id="planning-periods">{periods.map((value) => <option key={value} value={value} />)}</datalist>
        </label>
        <button type="button" className={styles.secondaryButton} onClick={() => void load(periodInput.trim() || defaultPeriod())}>Öppna</button>
        <button type="button" className={styles.primaryButton} onClick={addRow} disabled={stations.length === 0}>+ Rad</button>
        <div className={styles.sheetHint}>Enter = nästa cell · Tab = nästa cell · klistra in direkt från Excel</div>
        <div className={styles.periodStatus}><span>Aktiv period</span><strong>{period}</strong></div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.gridSection}>
        <div className={styles.gridHeading}>
          <div><strong>PLANERINGSMATRIS</strong><span>SALU · BEHOV · UTÖKNING · MINSKNING · BESTÄLLT</span></div>
          <strong>{rows.length} modeller · {stations.length} stationer</strong>
        </div>

        {loading ? <div className={styles.empty}>Läser planering…</div> : stations.length === 0 ? <div className={styles.empty}>Inga aktiva planeringsstationer finns.</div> : (
          <div className={styles.tableWrap}>
            <table className={styles.planningTable}>
              <thead>
                <tr>
                  <th rowSpan={2} className={styles.modelColumn}>Modell</th>
                  {METRICS.map(([metric, title]) => <th key={metric} colSpan={stations.length} className={styles.groupHeader}>{title}</th>)}
                  <th rowSpan={2} className={styles.noteColumn}>Kommentar</th>
                  <th rowSpan={2} className={styles.actionColumn} />
                </tr>
                <tr>{METRICS.flatMap(([metric]) => stations.map((station) => <th key={`${metric}-${station.station_code}`}>{station.display_name || station.station_code}</th>))}</tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => <tr key={row.key} className={row.dirty ? styles.dirtyRow : undefined}>
                  <td className={styles.modelColumn}><input data-model-cell="true" value={row.model} onChange={(event) => updateText(row.key, 'model', event.target.value)} placeholder="Modell" /></td>
                  {sheetColumns.map(({ metric, station }, columnIndex) => (
                    <td key={`${row.key}-${metric}-${station}`} className={styles.numberCell}>
                      <input
                        data-sheet-cell="true"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={(row.stations[station] ?? emptyCounts())[metric]}
                        onChange={(event) => updateCount(row.key, station, metric, event.target.value)}
                        onKeyDown={(event) => moveSheetFocus(event, event.shiftKey ? -1 : 1)}
                        onPaste={(event) => pasteSheet(rowIndex, columnIndex, event)}
                        onFocus={(event) => event.currentTarget.select()}
                        aria-label={`${row.model || 'Ny modell'} ${metric} ${station}`}
                      />
                    </td>
                  ))}
                  <td className={styles.noteColumn}><input value={row.note} onChange={(event) => updateText(row.key, 'note', event.target.value)} placeholder="Avrop, avvikelse, kommentar…" /></td>
                  <td className={styles.actionColumn}><button type="button" className={row.dirty ? styles.saveButtonDirty : styles.saveButton} onClick={() => void saveRow(row)} disabled={savingKey === row.key}>{savingKey === row.key ? '…' : row.dirty ? 'Spara*' : 'Spara'}</button></td>
                </tr>)}
                <tr className={styles.totalRow}>
                  <td className={styles.modelColumn}>TOTALT</td>
                  {sheetColumns.map(({ metric, station }) => <td key={`total-${metric}-${station}`}>{totals[station]?.[metric] ?? 0}</td>)}
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
