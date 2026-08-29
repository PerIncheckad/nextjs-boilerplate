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
  daily_rate: number | null;
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
type Draft = Omit<GarageItem, 'garage_item_id' | 'updated_at' | 'source_kind' | 'source_planning_cell_id' | 'source_planning_unit_no' | 'source_salu_flag_id'>;
type SaluSource = { flag_id: string; regnr: string; current_saludatum: string; status: string; imported: boolean; brand: string | null; model: string | null };
type SortField = 'UPDATED' | 'MODEL' | 'REGNR' | 'STATION' | 'DIRECTION' | 'PERIOD';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const emptyDraft = (station: string | null = null): Draft => ({
  planning_period: currentMonth(), model: '', garage_direction: null, planning_reason: 'ANNAT', supplier: '', order_reference: '', regnr: '', vin: '', source_regnr: '',
  planned_station: station, saluort: '', daily_rate: null, ordered_at: '', calloff_at: '', confirmation_status: 'PLANERAD', transport_status: 'EJ_BOKAD', planned_delivery_date: '', note: '',
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
  const [saluSources, setSaluSources] = useState<SaluSource[]>([]);
  const [saluDirection, setSaluDirection] = useState<GarageDirection | ''>('');
  const [saluStation, setSaluStation] = useState('');
  const [supplierDrafts, setSupplierDrafts] = useState<Record<string, string>>({});
  const [savingSupplierId, setSavingSupplierId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: { data?: GarageItem[]; stations?: PlanningStation[]; models?: PlanningModel[] }) => {
    const nextStations = payload.stations ?? [];
    const nextItems = payload.data ?? [];
    setStations(nextStations);
    setModels(payload.models ?? []);
    setItems(nextItems);
    setSupplierDrafts(Object.fromEntries(nextItems.map((item) => [item.garage_item_id, item.supplier ?? ''])));
    setDraft((current) => current.planned_station ? current : { ...current, planned_station: nextStations[0]?.station_code ?? null });
    setSaluStation((current) => current || nextStations[0]?.station_code || '');
  }, [setStations, setModels, setItems, setSupplierDrafts, setDraft, setSaluStation]);

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
      const response = await fetch('/api/garage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, direction_change_reason: 'Riktning satt vid skapande' }) });
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
    const response = await fetch('/api/garage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ garage_item_id: item.garage_item_id, ...changes }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload?.error ?? 'Kunde inte uppdatera Garaget');
    setItems((current) => current.map((value) => value.garage_item_id === item.garage_item_id ? payload.data : value));
  };

  const saveSupplier = async (item: GarageItem) => {
    setSavingSupplierId(item.garage_item_id);
    setError(null);
    try {
      const value = supplierDrafts[item.garage_item_id]?.trim() || null;
      const response = await fetch('/api/garage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ garage_item_id: item.garage_item_id, supplier: value }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte spara leverantör');
      setItems((current) => current.map((entry) => entry.garage_item_id === item.garage_item_id ? payload.data : entry));
      setSupplierDrafts((current) => ({ ...current, [item.garage_item_id]: payload.data?.supplier ?? '' }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kunde inte spara leverantör');
    } finally {
      setSavingSupplierId(null);
    }
  };

  const loadSaluSources = async () => {
    setError(null);
    const response = await fetch('/api/garage/salu-sources', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) return setError(payload?.error ?? 'Kunde inte läsa SALU');
    setSaluSources(payload.data ?? []);
  };

  const importSalu = async (source: SaluSource) => {
    if (!saluDirection || !saluStation) return setError('Välj riktning och station för SALU-bilen.');
    const response = await fetch('/api/garage/salu-sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ salu_flag_id: source.flag_id, garage_direction: saluDirection, planned_station: saluStation }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload?.error ?? 'Kunde inte hämta SALU-bilen');
    await Promise.all([load(), loadSaluSources()]);
  };

  const visible = useMemo(() => {
    const needle = query.trim().toUpperCase();
    const filtered = items.filter((item) => {
      if (station !== 'ALLA' && item.planned_station !== station) return false;
      if (direction !== 'ALLA' && item.garage_direction !== direction) return false;
      if (periodFilter && item.planning_period !== periodFilter) return false;
      if (!needle) return true;
      return [item.model, item.regnr, item.supplier, item.saluort].some((value) => value?.toUpperCase().includes(needle));
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
        <div><div className={styles.eyebrow}>INCHECKAD / BK</div><h1>Garaget</h1><p>UTVECKLA / IN · AVVECKLA / UT.</p></div>
        <div className={styles.headerActions}><Link href="/planning" className={styles.primaryButton}>Planering</Link><Link href="/tower" className={styles.secondaryButton}>Tower</Link><button className={styles.secondaryButton} type="button" onClick={() => window.print()}>Skriv ut</button><button className={styles.secondaryButton} type="button" onClick={() => window.print()} title="Välj Spara som PDF i utskriftsdialogen">PDF</button></div>
      </header>

      <datalist id="garage-models">{models.map((model) => <option key={model.model_code} value={model.display_name} />)}</datalist>
      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.sourceGrid}>
        <div className={styles.sourcePanel}>
          <div className={styles.panelTitle}><h2>Planering → Garaget</h2><span>När Planering markeras KLAR skapas BESTÄLLT automatiskt som individuella UTVECKLA-objekt.</span></div>
        </div>

        <div className={styles.sourcePanel}>
          <div className={styles.panelTitle}><h2>Hämta från SALU</h2><span>Exakt SALU-cykel kan bara hämtas en gång.</span></div>
          <div className={styles.inlineControls}>
            <label><span>Riktning</span><select value={saluDirection} onChange={(e) => setSaluDirection(e.target.value as GarageDirection | '')}><option value="">Välj</option><option value="IN">UTVECKLA / IN</option><option value="UT">AVVECKLA / UT</option></select></label>
            <label><span>Station</span><select value={saluStation} onChange={(e) => setSaluStation(e.target.value)}><option value="">Välj</option>{stations.map((value) => <option key={value.station_code} value={value.station_code}>{value.display_name || value.station_code}</option>)}</select></label>
            <button className={styles.secondaryButton} type="button" onClick={() => void loadSaluSources()}>Läs SALU</button>
          </div>
          <div className={styles.sourceList}>{saluSources.map((row) => <div className={styles.sourceRow} key={row.flag_id}><strong>{row.regnr}</strong><span>{[row.brand, row.model].filter(Boolean).join(' ') || 'Modell saknas'}</span><span>{row.status}</span><span>{row.current_saludatum}</span><button className={styles.primaryButton} type="button" disabled={row.imported} onClick={() => void importSalu(row)}>{row.imported ? 'Redan hämtad' : 'Hämta'}</button></div>)}</div>
        </div>
      </section>

      <section className={styles.createPanel}>
        <div className={styles.panelTitle}><h2>Lägg bil manuellt</h2><span>Manuell väg för undantag som inte kommer från Planering.</span></div>
        <div className={styles.formGrid}>
          <Field label="Riktning"><select value={draft.garage_direction ?? ''} onChange={(e) => setDraft({ ...draft, garage_direction: (e.target.value || null) as GarageDirection | null })}><option value="">Välj riktning</option><option value="IN">UTVECKLA / IN</option><option value="UT">AVVECKLA / UT</option></select></Field>
          <Field label="Månad"><input type="month" value={draft.planning_period ?? ''} onChange={(e) => setDraft({ ...draft, planning_period: e.target.value })} /></Field>
          <Field label="Modell"><input list="garage-models" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="Välj eller skriv modell" /></Field>
          <Field label="Planerad station"><select value={draft.planned_station ?? ''} onChange={(e) => setDraft({ ...draft, planned_station: e.target.value || null })}><option value="">Välj station</option>{stations.map((value) => <option key={value.station_code} value={value.station_code}>{value.display_name || value.station_code}</option>)}</select></Field>
          <Field label="Leverantör"><input value={draft.supplier ?? ''} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} /></Field>
          <Field label="Reg.nr"><input value={draft.regnr ?? ''} onChange={(e) => setDraft({ ...draft, regnr: e.target.value.toUpperCase() })} /></Field>
          <Field label="Dygnsdeb"><input type="number" min="0" value={draft.daily_rate ?? ''} onChange={(e) => setDraft({ ...draft, daily_rate: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Avropad"><input type="date" value={draft.calloff_at ?? ''} onChange={(e) => setDraft({ ...draft, calloff_at: e.target.value })} /></Field>
          <Field label="Planerad leverans"><input type="date" value={draft.planned_delivery_date ?? ''} onChange={(e) => setDraft({ ...draft, planned_delivery_date: e.target.value })} /></Field>
          <Field label="Kommentar"><input value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void create()} disabled={saving || stations.length === 0}>{saving ? 'Sparar…' : 'Lägg i Garaget'}</button>
      </section>

      <section className={styles.controls}>
        <label><span>Riktning</span><select value={direction} onChange={(e) => setDirection(e.target.value as 'ALLA' | GarageDirection)}><option value="IN">UTVECKLA / IN</option><option value="UT">AVVECKLA / UT</option><option value="ALLA">Alla</option></select></label>
        <label><span>Station</span><select value={station} onChange={(e) => setStation(e.target.value)}><option value="ALLA">Alla</option>{stations.map((value) => <option key={value.station_code} value={value.station_code}>{value.display_name || value.station_code}</option>)}</select></label>
        <label><span>Månad</span><input type="month" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} /></label>
        <button className={styles.secondaryButton} type="button" onClick={() => setPeriodFilter('')}>Alla månader</button>
        <label><span>Sortera</span><select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}><option value="UPDATED">Senast ändrad</option><option value="MODEL">Modell</option><option value="REGNR">Reg.nr</option><option value="STATION">Station</option><option value="DIRECTION">Riktning</option><option value="PERIOD">Månad</option></select></label>
        <button className={styles.secondaryButton} type="button" onClick={() => setSortDesc((value) => !value)}>{sortDesc ? '↓' : '↑'}</button>
        <label className={styles.search}><span>Sök</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modell, reg.nr, leverantör…" /></label>
        <strong>{visible.length} objekt</strong>
      </section>

      <section className={styles.tableSection}>{loading ? <div className={styles.empty}>Läser Garaget…</div> : direction === 'IN' ? (
        <div className={styles.tableWrap}><table><thead><tr><th>Källa</th><th>Månad</th><th>Modell</th><th className={styles.regnrColumn}>Reg.nr</th><th>Station</th><th>Leverantör</th><th>Dygnsdeb</th><th>Avropad</th><th>Leverans</th><th>Kommentar</th></tr></thead>
          <tbody>{visible.map((item) => <tr key={item.garage_item_id}>
            <td>{sourceLabel(item)}</td>
            <td>{item.planning_period ?? '—'}</td>
            <td>{item.model}</td>
            <td className={styles.regnrColumn}><input className={styles.regnrInput} defaultValue={item.regnr ?? ''} onBlur={(e) => blurPatch(item, 'regnr', item.regnr, e.target.value.toUpperCase() || null)} /></td>
            <td>{item.planned_station ?? '—'}</td>
            <td><div className={styles.supplierEditor}><input value={supplierDrafts[item.garage_item_id] ?? ''} onChange={(e) => setSupplierDrafts((current) => ({ ...current, [item.garage_item_id]: e.target.value }))} /><button type="button" className={styles.rowSaveButton} disabled={savingSupplierId === item.garage_item_id || (supplierDrafts[item.garage_item_id] ?? '') === (item.supplier ?? '')} onClick={() => void saveSupplier(item)}>{savingSupplierId === item.garage_item_id ? '…' : 'Spara'}</button></div></td>
            <td><input className={styles.rate} type="number" min="0" defaultValue={item.daily_rate ?? ''} onBlur={(e) => blurPatch(item, 'daily_rate', item.daily_rate, e.target.value === '' ? null : Number(e.target.value))} /></td>
            <td><input type="date" defaultValue={item.calloff_at ?? ''} onBlur={(e) => blurPatch(item, 'calloff_at', item.calloff_at, e.target.value || null)} /></td>
            <td><input type="date" defaultValue={item.planned_delivery_date ?? ''} onBlur={(e) => blurPatch(item, 'planned_delivery_date', item.planned_delivery_date, e.target.value || null)} /></td>
            <td><input defaultValue={item.note ?? ''} onBlur={(e) => blurPatch(item, 'note', item.note, e.target.value || null)} /></td>
          </tr>)}</tbody></table></div>
      ) : (
        <div className={styles.tableWrap}><table><thead><tr><th>Källa</th><th>Riktning</th><th>Månad</th><th>Modell</th><th>Reg.nr</th><th>VIN</th><th>Källreg</th><th>Orsak</th><th>Station</th><th>Leverantör</th><th>Order</th><th>Beställd</th><th>Avropad</th><th>Saluort</th><th>Dygn</th><th>Bekräftelse</th><th>Transport</th><th>Leverans</th><th>Kommentar</th></tr></thead>
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
            <td><input defaultValue={item.supplier ?? ''} onBlur={(e) => blurPatch(item, 'supplier', item.supplier, e.target.value || null)} /></td>
            <td><input defaultValue={item.order_reference ?? ''} onBlur={(e) => blurPatch(item, 'order_reference', item.order_reference, e.target.value || null)} /></td>
            <td><input type="date" defaultValue={item.ordered_at ?? ''} onBlur={(e) => blurPatch(item, 'ordered_at', item.ordered_at, e.target.value || null)} /></td>
            <td><input type="date" defaultValue={item.calloff_at ?? ''} onBlur={(e) => blurPatch(item, 'calloff_at', item.calloff_at, e.target.value || null)} /></td>
            <td><input defaultValue={item.saluort ?? ''} onBlur={(e) => blurPatch(item, 'saluort', item.saluort, e.target.value || null)} /></td>
            <td><input className={styles.rate} type="number" min="0" defaultValue={item.daily_rate ?? ''} onBlur={(e) => blurPatch(item, 'daily_rate', item.daily_rate, e.target.value === '' ? null : Number(e.target.value))} /></td>
            <td><select value={item.confirmation_status} onChange={(e) => void patch(item, { confirmation_status: e.target.value })}><option>PLANERAD</option><option>BESTALLD</option><option>AVROPAD</option><option>AVVAKTAR_BEKRAFTELSE</option><option>BEKRAFTAD</option></select></td>
            <td><select value={item.transport_status} onChange={(e) => void patch(item, { transport_status: e.target.value })}><option>EJ_BOKAD</option><option>TRANSPORTBOKAD</option><option>PA_VAG</option></select></td>
            <td><input type="date" defaultValue={item.planned_delivery_date ?? ''} onBlur={(e) => blurPatch(item, 'planned_delivery_date', item.planned_delivery_date, e.target.value || null)} /></td>
            <td><input defaultValue={item.note ?? ''} onBlur={(e) => blurPatch(item, 'note', item.note, e.target.value || null)} /></td>
          </tr>)}</tbody></table></div>
      )}</section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}