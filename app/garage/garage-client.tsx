'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './garage.module.css';

const STATIONS = ['166', '170', '274'] as const;

type GarageItem = {
  garage_item_id: string;
  planning_period: string | null;
  model: string;
  planning_reason: 'BEHOV' | 'UTOK' | 'MINSKNING' | 'SALU_RETUR' | 'ANNAT';
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
  updated_at: string;
};

type Draft = Omit<GarageItem, 'garage_item_id' | 'updated_at'>;

const emptyDraft = (): Draft => ({
  planning_period: '',
  model: '',
  planning_reason: 'BEHOV',
  supplier: '',
  order_reference: '',
  regnr: '',
  vin: '',
  source_regnr: '',
  planned_station: '166',
  saluort: '',
  daily_rate: null,
  ordered_at: '',
  calloff_at: '',
  confirmation_status: 'PLANERAD',
  transport_status: 'EJ_BOKAD',
  planned_delivery_date: '',
  note: '',
});

export default function GarageClient() {
  const [items, setItems] = useState<GarageItem[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [station, setStation] = useState('ALLA');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/garage', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Garaget');
      setItems(payload.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garaget');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!draft.model.trim()) {
      setError('Modell måste anges.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/garage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte skapa bilen i Garaget');
      setDraft(emptyDraft());
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
    if (!response.ok) {
      setError(payload?.error ?? 'Kunde inte uppdatera Garaget');
      return;
    }
    setItems((current) => current.map((value) => value.garage_item_id === item.garage_item_id ? payload.data : value));
  };

  const visible = useMemo(() => {
    const needle = query.trim().toUpperCase();
    return items.filter((item) => {
      if (station !== 'ALLA' && item.planned_station !== station) return false;
      if (!needle) return true;
      return [item.model, item.regnr, item.vin, item.supplier, item.order_reference, item.source_regnr]
        .some((value) => value?.toUpperCase().includes(needle));
    });
  }, [items, station, query]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>INCHECKAD / BK</div>
          <h1>Garaget</h1>
          <p>Konkreta bilar mellan planering och faktisk fordonsresa.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/planning" className={styles.primaryButton}>Planering</Link>
          <Link href="/tower" className={styles.secondaryButton}>Tower</Link>
        </div>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.createPanel}>
        <div className={styles.panelTitle}><h2>Lägg bil i Garaget</h2><span>Reg.nr/VIN får vara tomt tills uppgiften finns.</span></div>
        <div className={styles.formGrid}>
          <Field label="Period"><input value={draft.planning_period ?? ''} onChange={(e) => setDraft({ ...draft, planning_period: e.target.value })} placeholder="2026-Q3" /></Field>
          <Field label="Modell"><input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} /></Field>
          <Field label="Orsak"><select value={draft.planning_reason} onChange={(e) => setDraft({ ...draft, planning_reason: e.target.value as Draft['planning_reason'] })}><option>BEHOV</option><option value="UTOK">UTÖK</option><option>MINSKNING</option><option value="SALU_RETUR">SALU RETUR</option><option>ANNAT</option></select></Field>
          <Field label="Planerad station"><select value={draft.planned_station ?? ''} onChange={(e) => setDraft({ ...draft, planned_station: e.target.value })}>{STATIONS.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Leverantör"><input value={draft.supplier ?? ''} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} /></Field>
          <Field label="Order / avrop"><input value={draft.order_reference ?? ''} onChange={(e) => setDraft({ ...draft, order_reference: e.target.value })} /></Field>
          <Field label="Reg.nr"><input value={draft.regnr ?? ''} onChange={(e) => setDraft({ ...draft, regnr: e.target.value.toUpperCase() })} /></Field>
          <Field label="VIN"><input value={draft.vin ?? ''} onChange={(e) => setDraft({ ...draft, vin: e.target.value.toUpperCase() })} /></Field>
          <Field label="Saluort"><input value={draft.saluort ?? ''} onChange={(e) => setDraft({ ...draft, saluort: e.target.value })} /></Field>
          <Field label="Dygnsdebitering"><input type="number" min="0" value={draft.daily_rate ?? ''} onChange={(e) => setDraft({ ...draft, daily_rate: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Planerad leverans"><input type="date" value={draft.planned_delivery_date ?? ''} onChange={(e) => setDraft({ ...draft, planned_delivery_date: e.target.value })} /></Field>
          <Field label="Kommentar"><input value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void create()} disabled={saving}>{saving ? 'Sparar…' : 'Lägg i Garaget'}</button>
      </section>

      <section className={styles.controls}>
        <label><span>Station</span><select value={station} onChange={(e) => setStation(e.target.value)}><option value="ALLA">Alla</option>{STATIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className={styles.search}><span>Sök</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modell, reg.nr, VIN, leverantör…" /></label>
        <strong>{visible.length} objekt</strong>
      </section>

      <section className={styles.tableSection}>
        {loading ? <div className={styles.empty}>Läser Garaget…</div> : (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Modell</th><th>Reg.nr</th><th>VIN</th><th>Orsak</th><th>Station</th><th>Leverantör</th><th>Order</th><th>Saluort</th><th>Dygn</th><th>Bekräftelse</th><th>Transport</th><th>Leverans</th><th>Kommentar</th></tr></thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.garage_item_id}>
                    <td>{item.model}</td><td>{item.regnr ?? '—'}</td><td className={styles.vin}>{item.vin ?? '—'}</td><td>{item.planning_reason}</td>
                    <td><select value={item.planned_station ?? ''} onChange={(e) => void patch(item, { planned_station: e.target.value, station_change_reason: 'Omplanerad i Garaget' })}>{STATIONS.map((value) => <option key={value}>{value}</option>)}</select></td>
                    <td>{item.supplier ?? '—'}</td><td>{item.order_reference ?? '—'}</td>
                    <td><input defaultValue={item.saluort ?? ''} onBlur={(e) => { if (e.target.value !== (item.saluort ?? '')) void patch(item, { saluort: e.target.value }); }} /></td>
                    <td><input className={styles.rate} type="number" min="0" defaultValue={item.daily_rate ?? ''} onBlur={(e) => { const next = e.target.value === '' ? null : Number(e.target.value); if (next !== item.daily_rate) void patch(item, { daily_rate: next }); }} /></td>
                    <td><select value={item.confirmation_status} onChange={(e) => void patch(item, { confirmation_status: e.target.value })}><option>PLANERAD</option><option>BESTALLD</option><option>AVROPAD</option><option>AVVAKTAR_BEKRAFTELSE</option><option>BEKRAFTAD</option></select></td>
                    <td><select value={item.transport_status} onChange={(e) => void patch(item, { transport_status: e.target.value })}><option>EJ_BOKAD</option><option>TRANSPORTBOKAD</option><option>PA_VAG</option><option>ANKOMMEN</option></select></td>
                    <td><input type="date" defaultValue={item.planned_delivery_date ?? ''} onBlur={(e) => { if (e.target.value !== (item.planned_delivery_date ?? '')) void patch(item, { planned_delivery_date: e.target.value }); }} /></td>
                    <td><input defaultValue={item.note ?? ''} onBlur={(e) => { if (e.target.value !== (item.note ?? '')) void patch(item, { note: e.target.value }); }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.explainer}><strong>Garaget är inte Lager 1 eller Lager 2.</strong><p>Det är BK:s planeringsbestånd. En bil kan finnas här före reg.nr/VIN och en känd SALU-bil kan återvända hit för ny disposition utan att Lager 1-historiken skrivs om.</p></section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}
