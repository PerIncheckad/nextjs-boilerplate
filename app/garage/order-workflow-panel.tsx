'use client';

import { useEffect, useMemo, useState } from 'react';

type ConfirmationStatus = 'PLANERAD' | 'BESTALLD' | 'AVROPAD' | 'AVVAKTAR_BEKRAFTELSE' | 'BEKRAFTAD';
type TransportStatus = 'EJ_BOKAD' | 'TRANSPORTBOKAD' | 'PA_VAG';
type GarageItem = {
  garage_item_id: string;
  model: string;
  regnr: string | null;
  planned_station: string | null;
  supplier: string | null;
  order_reference: string | null;
  ordered_at: string | null;
  calloff_at: string | null;
  confirmation_status: ConfirmationStatus;
  transport_status: TransportStatus;
  planned_delivery_date: string | null;
  source_kind: 'MANUELL' | 'PLANERING' | 'SALU' | 'LAGER1';
};

type Result = { items: GarageItem[]; error: string | null };

const confirmationLabels: Record<ConfirmationStatus, string> = {
  PLANERAD: 'Planerad',
  BESTALLD: 'Beställd',
  AVROPAD: 'Avropad',
  AVVAKTAR_BEKRAFTELSE: 'Avvaktar bekräftelse',
  BEKRAFTAD: 'Bekräftad',
};
const transportLabels: Record<TransportStatus, string> = {
  EJ_BOKAD: 'Ej bokad',
  TRANSPORTBOKAD: 'Transport bokad',
  PA_VAG: 'På väg',
};

const shell: React.CSSProperties = { maxWidth: 1500, margin: '0 auto 20px', padding: 18, border: '1px solid #d7d7d7', borderRadius: 14, background: 'rgba(255,255,255,0.96)', boxShadow: '0 6px 24px rgba(0,0,0,0.06)' };
const summary: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, margin: '14px 0' };
const card: React.CSSProperties = { border: '1px solid #e2e2e2', borderRadius: 10, padding: 12, background: '#fff' };
const select: React.CSSProperties = { padding: '8px 9px', border: '1px solid #ccc', borderRadius: 8, background: '#fff', minWidth: 160 };

export default function OrderWorkflowPanel() {
  const [result, setResult] = useState<Result | null>(null);
  const [confirmationFilter, setConfirmationFilter] = useState<'ALLA' | ConfirmationStatus>('ALLA');
  const [transportFilter, setTransportFilter] = useState<'ALLA' | TransportStatus>('ALLA');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/garage?direction=UT', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { data?: GarageItem[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa AVVECKLA-flödet');
        if (active) setResult({ items: body.data ?? [], error: null });
      })
      .catch((reason: unknown) => {
        if (active) setResult({ items: [], error: reason instanceof Error ? reason.message : 'Kunde inte läsa AVVECKLA-flödet' });
      });
    return () => { active = false; };
  }, []);

  const items = useMemo(() => result?.items ?? [], [result?.items]);
  const filtered = useMemo(() => items.filter((item) => {
    if (confirmationFilter !== 'ALLA' && item.confirmation_status !== confirmationFilter) return false;
    if (transportFilter !== 'ALLA' && item.transport_status !== transportFilter) return false;
    return true;
  }), [items, confirmationFilter, transportFilter]);

  const counts = useMemo(() => ({
    total: items.length,
    awaiting: items.filter((item) => item.confirmation_status === 'AVVAKTAR_BEKRAFTELSE').length,
    confirmed: items.filter((item) => item.confirmation_status === 'BEKRAFTAD').length,
    inTransit: items.filter((item) => item.transport_status === 'PA_VAG').length,
  }), [items]);

  const patch = async (item: GarageItem, changes: Partial<Pick<GarageItem, 'confirmation_status' | 'transport_status'>>) => {
    setBusy(item.garage_item_id);
    try {
      const response = await fetch('/api/garage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ garage_item_id: item.garage_item_id, ...changes }),
      });
      const body = await response.json() as { data?: GarageItem; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? 'Kunde inte uppdatera status');
      setResult((current) => current ? { ...current, items: current.items.map((row) => row.garage_item_id === item.garage_item_id ? { ...row, ...body.data } : row), error: null } : current);
    } catch (reason) {
      setResult((current) => ({ items: current?.items ?? [], error: reason instanceof Error ? reason.message : 'Kunde inte uppdatera status' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={shell} aria-label="AVVECKLA i Garaget">
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>GARAGE / AVVECKLA / UT</div>
        <h2 style={{ margin: '3px 0 0' }}>Avvecklingsflöde</h2>
        <p style={{ margin: '5px 0 0', color: '#555' }}>Bekräftelse och transport hör bara till AVVECKLA / UT här. UTVECKLA / IN hanteras i den förenklade Garage-listan.</p>
      </div>

      <div style={summary}>
        <div style={card}><div style={{ fontSize: 12, color: '#666' }}>AVVECKLA</div><strong style={{ fontSize: 24 }}>{counts.total}</strong></div>
        <div style={card}><div style={{ fontSize: 12, color: '#666' }}>AVVAKTAR BEKRÄFTELSE</div><strong style={{ fontSize: 24 }}>{counts.awaiting}</strong></div>
        <div style={card}><div style={{ fontSize: 12, color: '#666' }}>BEKRÄFTADE</div><strong style={{ fontSize: 24 }}>{counts.confirmed}</strong></div>
        <div style={card}><div style={{ fontSize: 12, color: '#666' }}>PÅ VÄG</div><strong style={{ fontSize: 24 }}>{counts.inTransit}</strong></div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <label><span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Bekräftelsestatus</span><select style={select} value={confirmationFilter} onChange={(e) => setConfirmationFilter(e.target.value as 'ALLA' | ConfirmationStatus)}><option value="ALLA">Alla</option>{Object.entries(confirmationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>Transportstatus</span><select style={select} value={transportFilter} onChange={(e) => setTransportFilter(e.target.value as 'ALLA' | TransportStatus)}><option value="ALLA">Alla</option>{Object.entries(transportLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>

      {result?.error ? <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: '#fff1f1', color: '#a40000', fontWeight: 650 }}>{result.error}</div> : null}
      {!result ? <div style={{ color: '#666' }}>Läser AVVECKLA…</div> : filtered.length === 0 ? <div style={{ color: '#666' }}>Inga AVVECKLA / UT-objekt matchar filtret.</div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((item) => (
            <div key={item.garage_item_id} style={{ ...card, display: 'grid', gridTemplateColumns: 'minmax(180px,1.2fr) minmax(160px,1fr) minmax(180px,1fr) minmax(180px,1fr)', gap: 10, alignItems: 'center' }}>
              <div><strong>{item.model}</strong><div style={{ fontSize: 12, color: '#666' }}>{item.regnr || 'Regnr saknas'} · Stn {item.planned_station || '—'} · {item.source_kind}</div><div style={{ fontSize: 12, color: '#666' }}>{item.order_reference ? `Order ${item.order_reference}` : 'Orderreferens saknas'}{item.planned_delivery_date ? ` · Leverans ${item.planned_delivery_date}` : ''}</div></div>
              <div><div style={{ fontSize: 12, color: '#666' }}>Bekräftelse</div><select disabled={busy === item.garage_item_id} style={select} value={item.confirmation_status} onChange={(e) => void patch(item, { confirmation_status: e.target.value as ConfirmationStatus })}>{Object.entries(confirmationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div><div style={{ fontSize: 12, color: '#666' }}>Transport</div><select disabled={busy === item.garage_item_id} style={select} value={item.transport_status} onChange={(e) => void patch(item, { transport_status: e.target.value as TransportStatus })}>{Object.entries(transportLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div style={{ fontSize: 12, color: '#555' }}><strong>{confirmationLabels[item.confirmation_status]}</strong><br />{transportLabels[item.transport_status]}{item.calloff_at ? <><br />Avrop {item.calloff_at}</> : null}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
