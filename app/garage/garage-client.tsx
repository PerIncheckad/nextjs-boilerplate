'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import styles from './garage.module.css';

type PlanningStation = { station_code: string; display_name: string | null; sort_order: number };
type PlanningModel = { model_code: string; display_name: string; sort_order: number };
type GarageDirection = 'IN' | 'UT';
type PlanningReason = 'BEHOV' | 'UTOK' | 'MINSKNING' | 'SALU' | 'SALU_RETUR' | 'ANNAT';
type GarageItem = {
  garage_item_id: string;
  planning_period: string | null;
  model: string;
  garage_direction: GarageDirection | null;
  planning_reason: PlanningReason;
  supplier: string | null;
  order_reference: string | null;
  regnr: string | null;
  vin: string | null;
  source_regnr: string | null;
  planned_station: string | null;
  saluort: string | null;
  returadress: string | null;
  daily_rate: number | null;
  holding_period_months: number | null;
  ordered_at: string | null;
  calloff_at: string | null;
  confirmation_status: string;
  transport_status: string;
  planned_delivery_date: string | null;
  note: string | null;
  source_kind: 'MANUELL' | 'PLANERING' | 'SALU' | 'LAGER1';
  source_planning_cell_id: string | null;
  source_planning_unit_no: number | null;
  source_salu_flag_id: string | null;
  updated_at: string;
};
type Draft = {
  planning_period: string | null;
  model: string;
  garage_direction: GarageDirection | null;
  planning_reason: PlanningReason;
  regnr: string;
  vin: string;
  source_regnr: string;
  planned_station: string | null;
  saluort: string;
  returadress: string;
  daily_rate: number | null;
  holding_period_months: number | null;
  planned_delivery_date: string;
  note: string;
};
type SortField = 'UPDATED' | 'MODEL' | 'REGNR' | 'STATION' | 'DIRECTION' | 'PERIOD';

const HOLDING_PERIODS = [4, 6, 9, 12, 18, 24] as const;
const currentMonth = () => new Date().toISOString().slice(0, 7);
const emptyDraft = (station: string | null = null): Draft => ({
  planning_period: currentMonth(),
  model: '',
  garage_direction: null,
  planning_reason: 'ANNAT',
  regnr: '',
  vin: '',
  source_regnr: '',
  planned_station: station,
  saluort: '',
  returadress: '',
  daily_rate: null,
  holding_period_months: null,
  planned_delivery_date: '',
  note: '',
});
const directionLabel = (value: GarageDirection | null) => value === 'IN' ? 'UTVECKLA / IN' : value === 'UT' ? 'AVVECKLA / UT' : 'Ej satt';
const sourceLabel = (item: GarageItem) => item.source_kind === 'PLANERING' ? `Planering #${item.source_planning_unit_no ?? '—'}` : item.source_kind === 'SALU' ? 'SALU' : item.source_kind === 'LAGER1' ? 'Lager 1' : 'Manuell';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function GarageClient() {
  const searchParams = useSearchParams();
  const requestedPeriod = searchParams.get('period')?.trim() ?? '';
  const requestedDirection = searchParams.get('direction') === 'UT' ? 'UT' : 'IN';
  const [items, setItems] = useState<GarageItem[]>([]);
  const [stations, setStations] = useState<PlanningStation[]>([]);
  const [models, setModels] = useState<PlanningModel[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [station, setStation] = useState('ALLA');
  const [direction, setDirection] = useState<'ALLA' | GarageDirection>(requestedDirection);
  const [periodFilter, setPeriodFilter] = useState(MONTH_RE.test(requestedPeriod) ? requestedPeriod : '');
  const [query, setQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('UPDATED');
  const [sortDesc, setSortDesc] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: { data?: GarageItem[]; stations?: PlanningStation[]; models?: PlanningModel[] }) => {
    const nextStations = payload.stations ?? [];
    setStations(nextStations);
    setModels(payload.models ?? []);
    setItems(payload.data ?? []);
    setDraft((current) => current.planned_station ? current : { ...current, planned_station: nextStations[0]?.station_code ?? null });
  }, [setStations, setModels, setItems, setDraft]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/garage', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Garaget');
      applyPayload(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garaget');
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    let active = true;
    void fetch('/api/garage', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Garaget');
        if (!active) return;
        applyPayload(payload);
        setError(null);
      })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garaget'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyPayload]);

  const create = async () => {
    if (!draft.model.trim()) return setError('Modell måste anges.');
    if (!draft.garage_direction) return setError('Välj UTVECKLA / IN eller AVVECKLA / UT.');
    if (!draft.planned_station) return setError('Planerad station måste anges.');
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/garage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          regnr: draft.regnr || null,
          vin: draft.vin || null,
          source_regnr: draft.source_regnr || null,
          saluort: draft.saluort || null,
          returadress: draft.returadress || null,
          planned_delivery_date: draft.planned_delivery_date || null,
          note: draft.note || null,
          direction_change_reason: 'Riktning satt vid skapande',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte skapa bilen i Garaget');
      setDraft(emptyDraft(stations[0]?.station_code ?? null));
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kunde inte skapa bilen i Garaget');
    } finally {
      setSaving(false);
    }
  };

  const patch = async (item: GarageItem, changes: Record<string, unknown>) => {
    setError(null);
    const response = await fetch('/api/garage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garage_item_id: item.garage_item_id, ...changes }),
    });
    const payload = await response.json();
    if (!response.ok) return setError(payload?.error ?? 'Kunde inte uppdatera Garaget');
    setItems((current) => current.map((value) => value.garage_item_id === item.garage_item_id ? payload.data : value));
  };

  const visible = useMemo(() => {
    const needle = query.trim().toUpperCase();
    const filtered = items.filter((item) => {
      if (station !== 'ALLA' && item.planned_station !== station) return false;
      if (direction !== 'ALLA' && item.garage_direction !== direction) return false;
      if (periodFilter && item.planning_period !== periodFilter) return false;
      if (!needle) return true;
      return [item.model, item.regnr, item.saluort, item.returadress].some((value) => value?.toUpperCase().includes(needle));
    });
    const sortValue = (item: GarageItem) => sortField === 'MODEL' ? item.model : sortField === 'REGNR' ? item.regnr ?? '' : sortField === 'STATION' ? item.planned_station ?? '' : sortField === 'DIRECTION' ? item.garage_direction ?? '' : sortField === 'PERIOD' ? item.planning_period ?? '' : item.updated_at;
    return filtered.sort((a, b) => {
      const result = String(sortValue(a)).localeCompare(String(sortValue(b)), 'sv');
      return sortDesc ? -result : result;
    });
  }, [items, station, direction, periodFilter, query, sortField, sortDesc]);

  const blurPatch = (item: GarageItem, field: string, oldValue: unknown, nextValue: unknown) => {
    if (String(nextValue ?? '') !== String(oldValue ?? '')) void patch(item, { [field]: nextValue });
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><div className={styles.eyebrow}>INCHECKAD / BK</div><h1>GARAGET</h1><p>UTVECKLA / IN · AVVECKLA / UT.</p></div>
        <div className={styles.headerActions}><Link href="/planning" className={styles.primaryButton}>PLANERING</Link><Link href="/tower" className={styles.secondaryButton}>TOWER</Link><button aria-label="Skriv ut" className={styles.secondaryButton} type="button" onClick={() => window.print()}>SKRIV UT</button><button className={styles.secondaryButton} type="button" onClick={() => window.print()} title="Välj Spara som PDF i utskriftsdialogen">PDF</button></div>
      </header>

      <datalist id="garage-models">{models.map((model) => <option key={model.model_code} value={model.display_name} />)}</datalist>
      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.sourceGrid}>
        <div className={styles.sourcePanel}>
          <div className={styles.panelTitle}><h2>PLANERING → GARAGET</h2><span>Planering släpper bilen som redan beställd, avropad och bekräftad. Garaget kompletterar endast aktuell staginginformation.</span></div>
        </div>
      </section>

      <section className={styles.createPanel}>
        <div className={styles.panelTitle}><h2>LÄGG BIL MANUELLT</h2><span>Manuell väg för staging-undantag som inte kommer från Planering.</span></div>
        <div className={styles.formGrid}>
          <Field label="Riktning"><select value={draft.garage_direction ?? ''} onChange={(e) => setDraft({ ...draft, garage_direction: (e.target.value || null) as GarageDirection | null })}><option value="">Välj riktning</option><option value="IN">UTVECKLA / IN</option><option value="UT">AVVECKLA / UT</option></select></Field>
          <Field label="Månad"><input type="month" value={draft.planning_period ?? ''} onChange={(e) => setDraft({ ...draft, planning_period: e.target.value })} /></Field>
          <Field label="Modell"><input list="garage-models" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="Välj eller skriv modell" /></Field>
          <Field label="Planerad station"><select value={draft.planned_station ?? ''} onChange={(e) => setDraft({ ...draft, planned_station: e.target.value || null })}><option value="">Välj station</option>{stations.map((value) => <option key={value.station_code} value={value.station_code}>{value.display_name || value.station_code}</option>)}</select></Field>
          <Field label="Reg.nr"><input value={draft.regnr} onChange={(e) => setDraft({ ...draft, regnr: e.target.value.toUpperCase() })} /></Field>
          <Field label="Dygnsdeb"><input type="number" min="0" value={draft.daily_rate ?? ''} onChange={(e) => setDraft({ ...draft, daily_rate: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          {draft.garage_direction === 'IN' ? <>
            <Field label="Returadress"><input value={draft.returadress} onChange={(e) => setDraft({ ...draft, returadress: e.target.value })} /></Field>
            <Field label="Förväntad ankomst"><input type="date" value={draft.planned_delivery_date} onChange={(e) => setDraft({ ...draft, planned_delivery_date: e.target.value })} /></Field>
            <Field label="Hålltid"><select value={draft.holding_period_months ?? ''} onChange={(e) => setDraft({ ...draft, holding_period_months: e.target.value === '' ? null : Number(e.target.value) })}><option value="">Välj</option>{HOLDING_PERIODS.map((months) => <option key={months} value={months}>{months} mån</option>)}</select></Field>
          </> : null}
          {draft.garage_direction === 'UT' ? <>
            <Field label="VIN"><input value={draft.vin} onChange={(e) => setDraft({ ...draft, vin: e.target.value.toUpperCase() })} /></Field>
            <Field label="Källreg"><input value={draft.source_regnr} onChange={(e) => setDraft({ ...draft, source_regnr: e.target.value.toUpperCase() })} /></Field>
            <Field label="Orsak"><select value={draft.planning_reason} onChange={(e) => setDraft({ ...draft, planning_reason: e.target.value as PlanningReason })}><option>BEHOV</option><option value="UTOK">UTÖK</option><option>MINSKNING</option><option>SALU</option><option value="SALU_RETUR">SALU RETUR</option><option>ANNAT</option></select></Field>
            <Field label="Saluort"><input value={draft.saluort} onChange={(e) => setDraft({ ...draft, saluort: e.target.value })} /></Field>
          </> : null}
          <Field label="Kommentar"><input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void create()} disabled={saving || stations.length === 0}>{saving ? 'SPARAR…' : 'LÄGG I GARAGET'}</button>
      </section>

      <section className={styles.controls}>
        <label><span>RIKTNING</span><select aria-label="Riktning" value={direction} onChange={(e) => setDirection(e.target.value as 'ALLA' | GarageDirection)}><option value="IN">UTVECKLA / IN</option><option value="UT">AVVECKLA / UT</option><option value="ALLA">ALLA</option></select></label>
        <label><span>STATION</span><select aria-label="Station" value={station} onChange={(e) => setStation(e.target.value)}><option value="ALLA">ALLA</option>{stations.map((value) => <option key={value.station_code} value={value.station_code}>{value.display_name || value.station_code}</option>)}</select></label>
        <label><span>MÅNAD</span><input aria-label="Månad" type="month" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} /></label>
        <button className={styles.secondaryButton} type="button" onClick={() => setPeriodFilter('')}>ALLA MÅNADER</button>
        <label><span>SORTERA</span><select aria-label="Sortera" value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}><option value="UPDATED">SENAST ÄNDRAD</option><option value="MODEL">MODELL</option><option value="REGNR">REG.NR</option><option value="STATION">STATION</option><option value="DIRECTION">RIKTNING</option><option value="PERIOD">MÅNAD</option></select></label>
        <button className={styles.secondaryButton} type="button" onClick={() => setSortDesc((value) => !value)}>{sortDesc ? '↓' : '↑'}</button>
        <label className={styles.search}><span>SÖK</span><input aria-label="Sök" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modell, reg.nr, saluort, returadress…" /></label>
        <strong>{visible.length} OBJEKT</strong>
      </section>

      <section className={styles.tableSection}>{loading ? <div className={styles.empty}>Läser Garaget…</div> : direction === 'IN' ? (
        <div className={styles.tableWrap}><table><thead><tr><th>KÄLLA</th><th>MÅNAD</th><th>MODELL</th><th className={styles.regnrColumn}>REG.NR</th><th>STATION</th><th>RETURADRESS</th><th>FÖRVÄNTAD ANKOMST</th><th>DYGNSDEB</th><th>HÅLLTID</th><th>KOMMENTAR</th></tr></thead>
          <tbody>{visible.map((item) => <tr key={item.garage_item_id}>
            <td>{sourceLabel(item)}</td>
            <td>{item.planning_period ?? '—'}</td>
            <td>{item.model}</td>
            <td className={styles.regnrColumn}><input className={styles.regnrInput} defaultValue={item.regnr ?? ''} onBlur={(e) => blurPatch(item, 'regnr', item.regnr, e.target.value.toUpperCase() || null)} /></td>
            <td>{item.planned_station ?? '—'}</td>
            <td><input defaultValue={item.returadress ?? ''} onBlur={(e) => blurPatch(item, 'returadress', item.returadress, e.target.value || null)} /></td>
            <td><input type="date" defaultValue={item.planned_delivery_date ?? ''} onBlur={(e) => blurPatch(item, 'planned_delivery_date', item.planned_delivery_date, e.target.value || null)} /></td>
            <td><input className={styles.rate} type="number" min="0" defaultValue={item.daily_rate ?? ''} onBlur={(e) => blurPatch(item, 'daily_rate', item.daily_rate, e.target.value === '' ? null : Number(e.target.value))} /></td>
            <td><select value={item.holding_period_months ?? ''} onChange={(e) => void patch(item, { holding_period_months: e.target.value === '' ? null : Number(e.target.value) })}><option value="">—</option>{HOLDING_PERIODS.map((months) => <option key={months} value={months}>{months} mån</option>)}</select></td>
            <td><input defaultValue={item.note ?? ''} onBlur={(e) => blurPatch(item, 'note', item.note, e.target.value || null)} /></td>
          </tr>)}</tbody></table></div>
      ) : (
        <div className={styles.tableWrap}><table><thead><tr><th>KÄLLA</th><th>RIKTNING</th><th>MÅNAD</th><th>MODELL</th><th>REG.NR</th><th>VIN</th><th>KÄLLREG</th><th>ORSAK</th><th>STATION</th><th>SALUORT</th><th>KOMMENTAR</th></tr></thead>
          <tbody>{visible.map((item) => <tr key={item.garage_item_id}>
            <td>{sourceLabel(item)}</td>
            <td><select value={item.garage_direction ?? ''} onChange={(e) => { const next = e.target.value as GarageDirection; if (next) void patch(item, { garage_direction: next, direction_change_reason: `Ändrad i Garaget till ${directionLabel(next)}` }); }}><option value="" disabled>Välj</option><option value="IN">UTVECKLA / IN</option><option value="UT">AVVECKLA / UT</option></select></td>
            <td><input type="month" defaultValue={item.planning_period ?? ''} onBlur={(e) => blurPatch(item, 'planning_period', item.planning_period, e.target.value || null)} /></td>
            <td><input list="garage-models" defaultValue={item.model} onBlur={(e) => blurPatch(item, 'model', item.model, e.target.value)} /></td>
            <td><input defaultValue={item.regnr ?? ''} onBlur={(e) => blurPatch(item, 'regnr', item.regnr, e.target.value.toUpperCase() || null)} /></td>
            <td><input className={styles.vin} defaultValue={item.vin ?? ''} onBlur={(e) => blurPatch(item, 'vin', item.vin, e.target.value.toUpperCase() || null)} /></td>
            <td><input defaultValue={item.source_regnr ?? ''} onBlur={(e) => blurPatch(item, 'source_regnr', item.source_regnr, e.target.value.toUpperCase() || null)} /></td>
            <td><select value={item.planning_reason} onChange={(e) => void patch(item, { planning_reason: e.target.value })}><option>BEHOV</option><option value="UTOK">UTÖK</option><option>MINSKNING</option><option>SALU</option><option value="SALU_RETUR">SALU RETUR</option><option>ANNAT</option></select></td>
            <td><select value={item.planned_station ?? ''} onChange={(e) => void patch(item, { planned_station: e.target.value || null, station_change_reason: 'Omplanerad i Garaget' })}><option value="">—</option>{stations.map((value) => <option key={value.station_code} value={value.station_code}>{value.display_name || value.station_code}</option>)}</select></td>
            <td><input defaultValue={item.saluort ?? ''} onBlur={(e) => blurPatch(item, 'saluort', item.saluort, e.target.value || null)} /></td>
            <td><input defaultValue={item.note ?? ''} onBlur={(e) => blurPatch(item, 'note', item.note, e.target.value || null)} /></td>
          </tr>)}</tbody></table></div>
      )}</section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label.toLocaleUpperCase('sv-SE')}</span>{children}</label>;
}