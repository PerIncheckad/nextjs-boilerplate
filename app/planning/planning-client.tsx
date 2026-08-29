'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import styles from './planning.module.css';

const DECISIONS = [
  ['utok_count', 'UTÖKNING'],
  ['minskning_count', 'MINSKNING'],
  ['ordered_count', 'BESTÄLLT'],
] as const;

type DecisionMetric = typeof DECISIONS[number][0];
type Metric = DecisionMetric | 'behov_count' | 'salu_count';
type Counts = Record<Metric, number>;
type PlanningStation = { station_code: string; display_name: string | null; sort_order: number };
type PlanningModel = {
  model_code: string;
  display_name: string;
  brand: string;
  is_electric: boolean;
  is_automatic: boolean;
  daily_rate: number | null;
  aliases: string[] | null;
  sort_order: number;
};
type ApiCell = Counts & {
  planning_cell_id: string;
  period_code: string;
  model_code: string | null;
  model: string;
  station: string;
  note: string | null;
  updated_at: string;
};
type ModelRow = {
  key: string;
  modelCode: string;
  brand: string;
  model: string;
  isElectric: boolean;
  isAutomatic: boolean;
  dailyRate: number | null;
  aliases: string[];
  sortOrder: number;
  salu: number;
  note: string;
  stations: Record<string, Counts>;
  dirtyPlanning: boolean;
  dirtyModel: boolean;
};
type DraftEnvelope = { version: 3; savedAt: string; rows: ModelRow[] };
type PlanningPayload = { data?: ApiCell[]; stations?: PlanningStation[]; models?: PlanningModel[] };
type SaluModel = { key: string; label: string; windowTotal?: number };
type SaluWindow = { start: string; end: string; total: number; marginDays: number };
type SaluPayload = { data?: { models?: SaluModel[]; saluWindow?: SaluWindow } };
type Props = { selectedPeriod: string; onPeriodChange: (period: string) => void };

const emptyCounts = (): Counts => ({ salu_count: 0, behov_count: 0, utok_count: 0, minskning_count: 0, ordered_count: 0 });
const defaultPeriod = () => new Date().toISOString().slice(0, 7);
const draftKey = (period: string) => `incheckad-planning-draft-v3:${period}`;
const normalizedCount = (raw: string) => Math.max(0, Number.parseInt(raw.trim() || '0', 10) || 0);
const normalizeText = (value: string) => value.trim().toLocaleUpperCase('sv');

function pivot(cells: ApiCell[], stations: PlanningStation[], models: PlanningModel[], saluModels: SaluModel[]): ModelRow[] {
  const stationTemplate = () => Object.fromEntries(stations.map((station) => [station.station_code, emptyCounts()]));
  const saluByModel = new Map(saluModels.map((model) => [model.key, model.windowTotal ?? 0]));
  const modelsByCode = new Map(models.map((model) => [model.model_code, model]));
  const map = new Map<string, ModelRow>();

  for (const cell of cells) {
    const modelCode = cell.model_code;
    if (!modelCode) continue;
    const model = modelsByCode.get(modelCode);
    if (!model) continue;
    if (!map.has(modelCode)) {
      map.set(modelCode, {
        key: modelCode,
        modelCode,
        brand: model.brand,
        model: model.display_name,
        isElectric: model.is_electric,
        isAutomatic: model.is_automatic,
        dailyRate: model.daily_rate,
        aliases: model.aliases ?? [],
        sortOrder: model.sort_order,
        salu: saluByModel.get(modelCode) ?? 0,
        note: '',
        dirtyPlanning: false,
        dirtyModel: false,
        stations: stationTemplate(),
      });
    }
    const row = map.get(modelCode)!;
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

function restoreDraft(period: string, serverRows: ModelRow[]) {
  if (typeof window === 'undefined') return { rows: serverRows, restored: 0 };
  try {
    const raw = window.localStorage.getItem(draftKey(period));
    if (!raw) return { rows: serverRows, restored: 0 };
    const parsed = JSON.parse(raw) as Partial<DraftEnvelope>;
    if (parsed.version !== 3 || !Array.isArray(parsed.rows)) return { rows: serverRows, restored: 0 };
    const draftByCode = new Map(parsed.rows.map((row) => [row.modelCode, row]));
    let restored = 0;
    const rows = serverRows.map((serverRow) => {
      const draft = draftByCode.get(serverRow.modelCode);
      if (!draft) return serverRow;
      restored += 1;
      return { ...serverRow, ...draft, salu: serverRow.salu, key: serverRow.key, modelCode: serverRow.modelCode };
    });
    return { rows, restored };
  } catch { return { rows: serverRows, restored: 0 }; }
}

async function fetchPlanningBundle(nextPeriod: string) {
  const [planningResponse, saluResponse] = await Promise.all([
    fetch(`/api/fleet-planning?period=${encodeURIComponent(nextPeriod)}`, { cache: 'no-store' }),
    fetch(`/api/planning/salu-overview?period=${encodeURIComponent(nextPeriod)}`, { cache: 'no-store' }),
  ]);
  const planning = await planningResponse.json() as PlanningPayload & { error?: string };
  if (!planningResponse.ok) throw new Error(planning.error ?? 'Kunde inte läsa planeringen');
  const salu = saluResponse.ok ? await saluResponse.json() as SaluPayload : {};
  return { planning, salu };
}

export default function FleetPlanningClient({ selectedPeriod, onPeriodChange }: Props) {
  const [period, setPeriod] = useState(selectedPeriod);
  const [periodInput, setPeriodInput] = useState(selectedPeriod);
  const [metric, setMetric] = useState<DecisionMetric>('ordered_count');
  const [stations, setStations] = useState<PlanningStation[]>([]);
  const [registryModels, setRegistryModels] = useState<PlanningModel[]>([]);
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [saluWindow, setSaluWindow] = useState<SaluWindow | null>(null);
  const [unmappedSalu, setUnmappedSalu] = useState<SaluModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [addingModel, setAddingModel] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');

  const dirtyRows = useMemo(() => rows.filter((row) => row.dirtyPlanning || row.dirtyModel), [rows]);
  const metricLabel = DECISIONS.find(([key]) => key === metric)?.[1] ?? 'BESTÄLLT';
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('sv');
    return rows
      .filter((row) => !needle || row.model.toLocaleLowerCase('sv').includes(needle) || row.brand.toLocaleLowerCase('sv').includes(needle))
      .sort((a, b) => a.brand.localeCompare(b.brand, 'sv') || a.sortOrder - b.sortOrder || a.model.localeCompare(b.model, 'sv'));
  }, [rows, search]);
  const savedBrands = useMemo(() => [...new Set(registryModels.map((model) => model.brand.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sv')), [registryModels]);
  const savedModels = useMemo(() => {
    const brand = normalizeText(newBrand);
    return registryModels
      .filter((model) => !brand || normalizeText(model.brand) === brand)
      .map((model) => model.display_name.trim())
      .filter(Boolean)
      .filter((value, index, all) => all.findIndex((item) => normalizeText(item) === normalizeText(value)) === index)
      .sort((a, b) => a.localeCompare(b, 'sv'));
  }, [newBrand, registryModels]);
  const totalForRow = (row: ModelRow) => stations.reduce((sum, station) => sum + (row.stations[station.station_code] ?? emptyCounts())[metric], 0);
  const stationTotals = useMemo(() => Object.fromEntries(stations.map((station) => [station.station_code, rows.reduce((sum, row) => sum + (row.stations[station.station_code] ?? emptyCounts())[metric], 0)])), [metric, rows, stations]);
  const grandTotal = useMemo(() => Object.values(stationTotals).reduce((sum, value) => sum + value, 0), [stationTotals]);
  const saluTotal = useMemo(() => rows.reduce((sum, row) => sum + row.salu, 0), [rows]);
  const periodChanging = period !== selectedPeriod && !error;

  const applyBundle = useCallback((bundle: Awaited<ReturnType<typeof fetchPlanningBundle>>, nextPeriod: string, recover = true) => {
    const nextStations = bundle.planning.stations ?? [];
    const nextModels = bundle.planning.models ?? [];
    const saluModels = bundle.salu.data?.models ?? [];
    const serverRows = pivot(bundle.planning.data ?? [], nextStations, nextModels, saluModels);
    const restored = recover ? restoreDraft(nextPeriod, serverRows) : { rows: serverRows, restored: 0 };
    const codes = new Set(nextModels.map((model) => model.model_code));
    setStations(nextStations);
    setRegistryModels(nextModels);
    setRows(restored.rows);
    setSaluWindow(bundle.salu.data?.saluWindow ?? null);
    setUnmappedSalu(saluModels.filter((model) => !codes.has(model.key) && (model.windowTotal ?? 0) > 0));
    setPeriod(nextPeriod);
    setPeriodInput(nextPeriod);
    setDraftNotice(restored.restored ? `Återställde ${restored.restored} osparade rader.` : null);
  }, []);

  const load = useCallback(async (nextPeriod: string, recover = true) => {
    setLoading(true); setError(null); setStatus(null);
    try {
      const bundle = await fetchPlanningBundle(nextPeriod);
      applyBundle(bundle, nextPeriod, recover);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunde inte läsa planeringen'); }
    finally { setLoading(false); }
  }, [applyBundle]);

  useEffect(() => {
    let active = true;
    void fetchPlanningBundle(selectedPeriod)
      .then((bundle) => { if (active) { applyBundle(bundle, selectedPeriod); setError(null); setStatus(null); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Kunde inte läsa planeringen'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyBundle, selectedPeriod]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!dirtyRows.length) { window.localStorage.removeItem(draftKey(period)); return; }
      const envelope: DraftEnvelope = { version: 3, savedAt: new Date().toISOString(), rows: dirtyRows };
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
      dirtyPlanning: true,
      stations: { ...row.stations, [stationCode]: { ...(row.stations[stationCode] ?? emptyCounts()), [metric]: value } },
    } : row));
  };

  const updateNote = (key: string, value: string) => {
    setRows((current) => current.map((row) => row.key === key ? { ...row, note: value, dirtyPlanning: true } : row));
  };

  const updateModel = (key: string, patch: Partial<Pick<ModelRow, 'brand' | 'model' | 'isElectric' | 'dailyRate'>>) => {
    setStatus(null);
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch, dirtyModel: true } : row));
  };

  const saveModel = async (row: ModelRow) => {
    const response = await fetch('/api/planning/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_code: row.modelCode,
        display_name: row.model,
        brand: row.brand,
        is_electric: row.isElectric,
        is_automatic: row.isAutomatic,
        daily_rate: row.dailyRate,
        aliases: row.aliases,
        sort_order: row.sortOrder,
        is_active: true,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error ?? 'Kunde inte spara modellen');
  };

  const payloadForRow = (row: ModelRow) => stations.map((station) => ({
    period_code: period,
    model_code: row.modelCode,
    model: row.model,
    station: station.station_code,
    ...(row.stations[station.station_code] ?? emptyCounts()),
    note: row.note.trim() || null,
  }));

  const savePlanningRow = async (row: ModelRow) => {
    const response = await fetch('/api/fleet-planning', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadForRow(row)),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error ?? 'Kunde inte spara planeringen');
  };

  const saveRow = async (row: ModelRow) => {
    setSavingKey(row.key); setError(null); setStatus(null);
    try {
      if (row.dirtyModel) await saveModel(row);
      if (row.dirtyPlanning) await savePlanningRow(row);
      setRows((current) => current.map((item) => item.key === row.key ? { ...item, dirtyModel: false, dirtyPlanning: false } : item));
      setStatus(`${row.brand} ${row.model} sparad.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunde inte spara raden'); }
    finally { setSavingKey(null); }
  };

  const saveAll = async () => {
    if (!dirtyRows.length) return;
    setSavingAll(true); setError(null); setStatus(null);
    try {
      for (const row of dirtyRows.filter((item) => item.dirtyModel)) await saveModel(row);
      const planningRows = dirtyRows.filter((item) => item.dirtyPlanning).flatMap(payloadForRow);
      for (let index = 0; index < planningRows.length; index += 450) {
        const response = await fetch('/api/fleet-planning', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(planningRows.slice(index, index + 450)) });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? 'Kunde inte spara planeringen');
      }
      window.localStorage.removeItem(draftKey(period));
      const saved = dirtyRows.length;
      await load(period, false);
      setStatus(`${saved} ${saved === 1 ? 'rad' : 'rader'} sparade.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunde inte spara planeringen'); }
    finally { setSavingAll(false); }
  };

  const createModel = async () => {
    const brand = newBrand.trim();
    const name = newModel.trim();
    if (!brand || !name) return;
    setError(null); setStatus(null);
    try {
      const existing = registryModels.find((model) => normalizeText(model.brand) === normalizeText(brand) && normalizeText(model.display_name) === normalizeText(name));
      let modelCode = existing?.model_code ?? `CUSTOM:${crypto.randomUUID()}`;

      if (!existing) {
        const modelResponse = await fetch('/api/planning/models', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_code: modelCode, display_name: name, brand, is_electric: false, is_automatic: false, daily_rate: null, aliases: [], sort_order: 9999, is_active: true }),
        });
        const modelBody = await modelResponse.json() as { data?: PlanningModel; error?: string };
        if (!modelResponse.ok) throw new Error(modelBody?.error ?? 'Kunde inte lägga till modellen');
        modelCode = modelBody.data?.model_code ?? modelCode;
      }

      const alreadyInPeriod = rows.some((row) => row.modelCode === modelCode);
      if (!alreadyInPeriod) {
        const periodRows = stations.map((station) => ({
          period_code: period,
          model_code: modelCode,
          model: existing?.display_name ?? name,
          station: station.station_code,
          ...emptyCounts(),
          note: null,
        }));
        if (periodRows.length) {
          const planningResponse = await fetch('/api/fleet-planning', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(periodRows),
          });
          const planningBody = await planningResponse.json();
          if (!planningResponse.ok) throw new Error(planningBody?.error ?? 'Kunde inte lägga till raden i planeringen');
        }
      }

      setNewBrand(brand.toUpperCase()); setNewModel(''); setAddingModel(false);
      await load(period, false);
      setStatus(alreadyInPeriod ? `${brand.toUpperCase()} ${name} finns redan i ${period}.` : `${brand.toUpperCase()} ${name} tillagd i ${period}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunde inte lägga till modellen'); }
  };

  const openPeriod = () => {
    const nextPeriod = periodInput || defaultPeriod();
    if (nextPeriod === selectedPeriod) { void load(nextPeriod); return; }
    onPeriodChange(nextPeriod);
  };

  const moveFocus = (event: KeyboardEvent<HTMLInputElement>, direction: number) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const cells = [...document.querySelectorAll<HTMLInputElement>('input[data-planning-cell="true"]')];
    const index = cells.indexOf(event.currentTarget);
    cells[index + direction]?.focus();
    cells[index + direction]?.select();
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><div className={styles.eyebrow}>INCHECKAD / VAGNPARKSPLANERING</div><h1>Planering</h1><p>SALU är beslutsstöd. Planeringsbeslut skrivs endast av användaren.</p></div>
        <div className={styles.headerActions}><Link href="/tower" className={styles.secondaryButton}>Tower</Link><Link href="/garage" className={styles.primaryButton}>Garaget</Link></div>
      </header>

      <section className={styles.toolbar}>
        <label className={styles.periodControl}><span>Månad</span><input type="month" value={periodInput} onChange={(event) => setPeriodInput(event.target.value)} /></label>
        <button type="button" className={styles.secondaryButton} onClick={openPeriod}>Öppna</button>
        <div className={styles.decisionTabs} role="tablist" aria-label="Planeringsbeslut">
          {DECISIONS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={metric === key} className={metric === key ? styles.decisionTabActive : styles.decisionTab} onClick={() => setMetric(key)}>{label}</button>)}
        </div>
        <input className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök märke/modell…" aria-label="Sök märke eller modell" />
        <button type="button" className={styles.secondaryButton} onClick={() => setAddingModel((value) => !value)}>+ Märke / modell</button>
        <button type="button" className={dirtyRows.length ? styles.saveAllButtonDirty : styles.saveAllButton} onClick={() => void saveAll()} disabled={!dirtyRows.length || savingAll}>{savingAll ? 'Sparar…' : dirtyRows.length ? `Spara alla (${dirtyRows.length})` : 'Allt sparat'}</button>
        <div className={styles.periodStatus}><span>SALU-fönster</span><strong>{saluWindow ? `${saluWindow.start} – ${saluWindow.end}` : '–'}</strong></div>
      </section>

      {addingModel ? <section className={styles.addModelBar}>
        <input list="planning-saved-brands" value={newBrand} onChange={(event) => setNewBrand(event.target.value)} placeholder="Märke" aria-label="Märke" autoComplete="off" />
        <datalist id="planning-saved-brands">{savedBrands.map((brand) => <option key={brand} value={brand} />)}</datalist>
        <input list="planning-saved-models" value={newModel} onChange={(event) => setNewModel(event.target.value)} placeholder="Modell" aria-label="Modell" autoComplete="off" onKeyDown={(event) => { if (event.key === 'Enter') void createModel(); }} />
        <datalist id="planning-saved-models">{savedModels.map((model) => <option key={model} value={model} />)}</datalist>
        <button type="button" className={styles.primaryButton} onClick={() => void createModel()} disabled={!newBrand.trim() || !newModel.trim()}>Lägg till</button>
      </section> : null}

      {draftNotice ? <div className={styles.info}>{draftNotice}</div> : null}
      {status ? <div className={styles.success}>{status}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      {unmappedSalu.length ? <div className={styles.info}><strong>SALU utan modellkoppling:</strong> {unmappedSalu.map((item) => `${item.label} (${item.windowTotal ?? 0})`).join(' · ')}. Lägg till eller rätta märke/modell vid behov.</div> : null}

      <section className={styles.gridSection}>
        <div className={styles.gridHeading}><div><strong>{metricLabel} — {period}</strong><span>MÄRKE · MODELL · EL · stationer · SUMMA · SALU · DYGNDEB</span></div><strong>{dirtyRows.length ? `${dirtyRows.length} osparade · ` : ''}{visibleRows.length} rader</strong></div>
        {loading || periodChanging ? <div className={styles.empty}>Läser planering…</div> : stations.length === 0 ? <div className={styles.empty}>Inga aktiva planeringsstationer finns.</div> : (
          <div className={styles.tableWrap}><table className={styles.simplePlanningTable}>
            <thead><tr>
              <th className={styles.modelColumn}>Märke</th><th className={styles.modelColumn}>Modell</th><th className={styles.flagColumn}>EL</th>
              {stations.map((station) => <th key={station.station_code}>{station.station_code}<small>{station.display_name && station.display_name !== station.station_code ? station.display_name : ''}</small></th>)}
              <th>Summa</th><th className={styles.saluColumn}>SALU</th><th className={styles.noteColumn}>Kommentar</th><th className={styles.actionColumn}>Spara</th><th className={styles.rateColumn}>Dygnsdeb</th>
            </tr></thead>
            <tbody>
              {visibleRows.flatMap((row, index) => {
                const brandHeader = index === 0 || visibleRows[index - 1]?.brand !== row.brand
                  ? <tr key={`brand-${row.brand}`} className={styles.brandRow}><td colSpan={stations.length + 8}>{row.brand}</td></tr>
                  : null;
                const isDirty = row.dirtyModel || row.dirtyPlanning;
                return [brandHeader, <tr key={row.key} className={isDirty ? styles.dirtyRow : undefined}>
                  <td className={styles.modelColumn}><input className={styles.modelNameInput} value={row.brand} onChange={(event) => updateModel(row.key, { brand: event.target.value })} aria-label={`Märke ${row.modelCode}`} /></td>
                  <td className={styles.modelColumn}><input className={styles.modelNameInput} value={row.model} onChange={(event) => updateModel(row.key, { model: event.target.value })} aria-label={`Modellnamn ${row.modelCode}`} /></td>
                  <td className={styles.flagColumn}><input className={styles.checkInput} type="checkbox" checked={row.isElectric} onChange={(event) => updateModel(row.key, { isElectric: event.target.checked })} aria-label={`${row.model} EL`} /></td>
                  {stations.map((station) => <td key={`${row.key}-${station.station_code}`} className={styles.numberCell}><input data-planning-cell="true" type="number" min={0} inputMode="numeric" value={(row.stations[station.station_code] ?? emptyCounts())[metric]} onChange={(event) => updateCount(row.key, station.station_code, event.target.value)} onKeyDown={(event) => moveFocus(event, event.shiftKey ? -1 : 1)} onFocus={(event) => event.currentTarget.select()} aria-label={`${row.model} ${metricLabel} ${station.station_code}`} /></td>)}
                  <td className={styles.rowTotal}>{totalForRow(row)}</td>
                  <td className={styles.saluColumn}>{row.salu}</td>
                  <td className={styles.noteColumn}><input value={row.note} onChange={(event) => updateNote(row.key, event.target.value)} placeholder="Kommentar…" /></td>
                  <td className={styles.actionColumn}><button type="button" className={isDirty ? styles.saveButtonDirty : styles.saveButton} onClick={() => void saveRow(row)} disabled={savingKey === row.key || !isDirty}>{savingKey === row.key ? '…' : isDirty ? 'Spara*' : 'Sparad'}</button></td>
                  <td className={styles.rateColumn}><input type="number" min={0} inputMode="numeric" value={row.dailyRate ?? ''} placeholder="–" onChange={(event) => updateModel(row.key, { dailyRate: event.target.value === '' ? null : normalizedCount(event.target.value) })} aria-label={`${row.model} dygnsdeb`} /></td>
                </tr>];
              })}
              <tr className={styles.totalRow}><td className={styles.modelColumn}>TOTALT</td><td /><td />{stations.map((station) => <td key={`total-${station.station_code}`}>{stationTotals[station.station_code] ?? 0}</td>)}<td className={styles.rowTotal}>{grandTotal}</td><td className={styles.saluColumn}>{saluTotal}</td><td /><td /><td /></tr>
            </tbody>
          </table></div>
        )}
      </section>
    </main>
  );
}
