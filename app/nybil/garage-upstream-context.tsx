'use client';

import { useEffect, useMemo, useState } from 'react';

type UpstreamContext = {
  planning_period: string | null;
  planning_reason: string | null;
  supplier: string | null;
  order_reference: string | null;
  vin: string | null;
  source_regnr: string | null;
  saluort: string | null;
  daily_rate: number | null;
  holding_period_months: number | null;
  ordered_at: string | null;
  calloff_at: string | null;
  confirmation_status: string | null;
  transport_status: string | null;
  planned_delivery_date: string | null;
  planning_note: string | null;
};

type HandoffData = UpstreamContext & {
  garage_item_id: string;
  regnr: string;
  model: string;
  planned_station: string | null;
  note?: string | null;
};

const empty: UpstreamContext = {
  planning_period: null,
  planning_reason: null,
  supplier: null,
  order_reference: null,
  vin: null,
  source_regnr: null,
  saluort: null,
  daily_rate: null,
  holding_period_months: null,
  ordered_at: null,
  calloff_at: null,
  confirmation_status: null,
  transport_status: null,
  planned_delivery_date: null,
  planning_note: null,
};

function storageKey(garageItemId: string) {
  return `nybil-upstream:${garageItemId}`;
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function GarageUpstreamContext() {
  const [garageItemId, setGarageItemId] = useState<string | null>(null);
  const [source, setSource] = useState<HandoffData | null>(null);
  const [value, setValue] = useState<UpstreamContext>(empty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('garage_item_id')?.trim() || null;
    setGarageItemId(id);
    if (!id) return;

    let cancelled = false;
    void fetch(`/api/garage/nybil-handoff?garage_item_id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Garage-informationen');
        if (cancelled) return;
        const data = payload.data as HandoffData;
        const next: UpstreamContext = {
          planning_period: data.planning_period ?? null,
          planning_reason: data.planning_reason ?? null,
          supplier: data.supplier ?? null,
          order_reference: data.order_reference ?? null,
          vin: data.vin ?? null,
          source_regnr: data.source_regnr ?? null,
          saluort: data.saluort ?? null,
          daily_rate: data.daily_rate === null || data.daily_rate === undefined ? null : Number(data.daily_rate),
          holding_period_months: data.holding_period_months === null || data.holding_period_months === undefined ? null : Number(data.holding_period_months),
          ordered_at: data.ordered_at ?? null,
          calloff_at: data.calloff_at ?? null,
          confirmation_status: data.confirmation_status ?? null,
          transport_status: data.transport_status ?? null,
          planned_delivery_date: data.planned_delivery_date ?? null,
          planning_note: data.note ?? data.planning_note ?? null,
        };
        setSource(data);
        setValue(next);
        sessionStorage.setItem(storageKey(id), JSON.stringify(next));
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garage-informationen');
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!garageItemId || !source) return;
    sessionStorage.setItem(storageKey(garageItemId), JSON.stringify(value));
  }, [garageItemId, source, value]);

  const changedCount = useMemo(() => {
    if (!source) return 0;
    const sourceValue: UpstreamContext = {
      planning_period: source.planning_period ?? null,
      planning_reason: source.planning_reason ?? null,
      supplier: source.supplier ?? null,
      order_reference: source.order_reference ?? null,
      vin: source.vin ?? null,
      source_regnr: source.source_regnr ?? null,
      saluort: source.saluort ?? null,
      daily_rate: source.daily_rate === null || source.daily_rate === undefined ? null : Number(source.daily_rate),
      holding_period_months: source.holding_period_months === null || source.holding_period_months === undefined ? null : Number(source.holding_period_months),
      ordered_at: source.ordered_at ?? null,
      calloff_at: source.calloff_at ?? null,
      confirmation_status: source.confirmation_status ?? null,
      transport_status: source.transport_status ?? null,
      planned_delivery_date: source.planned_delivery_date ?? null,
      planning_note: source.note ?? source.planning_note ?? null,
    };
    return (Object.keys(value) as Array<keyof UpstreamContext>).filter((key) => value[key] !== sourceValue[key]).length;
  }, [source, value]);

  if (!garageItemId) return null;
  if (error) return <section style={boxStyle}><strong>Garage-information kunde inte speglas:</strong> {error}</section>;
  if (!source) return <section style={boxStyle}>Läser information från Planering / Garaget…</section>;

  const set = <K extends keyof UpstreamContext>(key: K, next: UpstreamContext[K]) => setValue((current) => ({ ...current, [key]: next }));

  return (
    <section style={boxStyle} aria-label="Information från Planering och Garaget">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontSize: 16 }}>Planering / Garaget · följer bilen</strong>
          <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>
            Värdena kommer från Garaget. Ändra här om verkligheten är en annan. Garage-källan skrivs inte om.
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{changedCount ? `${changedCount} ändrade värden` : 'Oförändrad källbild'}</span>
      </div>

      <div style={gridStyle}>
        <Field label="Planeringsperiod"><input value={value.planning_period ?? ''} onChange={(e) => set('planning_period', nullableText(e.target.value))} placeholder="YYYY-MM" /></Field>
        <Field label="Orsak"><select value={value.planning_reason ?? ''} onChange={(e) => set('planning_reason', nullableText(e.target.value))}><option value="">–</option><option>BEHOV</option><option>UTOK</option><option>MINSKNING</option><option>SALU</option><option>SALU_RETUR</option><option>ANNAT</option></select></Field>
        <Field label="Leverantör"><input value={value.supplier ?? ''} onChange={(e) => set('supplier', nullableText(e.target.value))} /></Field>
        <Field label="Orderreferens"><input value={value.order_reference ?? ''} onChange={(e) => set('order_reference', nullableText(e.target.value))} /></Field>
        <Field label="VIN"><input value={value.vin ?? ''} onChange={(e) => set('vin', nullableText(e.target.value))} /></Field>
        <Field label="Käll-reg.nr"><input value={value.source_regnr ?? ''} onChange={(e) => set('source_regnr', nullableText(e.target.value))} /></Field>
        <Field label="Saluort"><input value={value.saluort ?? ''} onChange={(e) => set('saluort', nullableText(e.target.value))} /></Field>
        <Field label="Dygnsdeb"><input type="number" min="0" value={value.daily_rate ?? ''} onChange={(e) => set('daily_rate', nullableNumber(e.target.value))} /></Field>
        <Field label="Hålltid"><select value={value.holding_period_months ?? ''} onChange={(e) => set('holding_period_months', e.target.value ? Number(e.target.value) : null)}><option value="">–</option>{[4,6,9,12,18,24].map((n) => <option key={n} value={n}>{n} mån</option>)}</select></Field>
        <Field label="Beställd"><input type="date" value={value.ordered_at ?? ''} onChange={(e) => set('ordered_at', nullableText(e.target.value))} /></Field>
        <Field label="Avropad"><input type="date" value={value.calloff_at ?? ''} onChange={(e) => set('calloff_at', nullableText(e.target.value))} /></Field>
        <Field label="Bekräftelse"><select value={value.confirmation_status ?? ''} onChange={(e) => set('confirmation_status', nullableText(e.target.value))}><option value="">–</option><option>PLANERAD</option><option>BESTALLD</option><option>AVROPAD</option><option>AVVAKTAR_BEKRAFTELSE</option><option>BEKRAFTAD</option></select></Field>
        <Field label="Transport"><select value={value.transport_status ?? ''} onChange={(e) => set('transport_status', nullableText(e.target.value))}><option value="">–</option><option>EJ_BOKAD</option><option>TRANSPORTBOKAD</option><option>PA_VAG</option><option>ANKOMMEN</option></select></Field>
        <Field label="Planerad leverans"><input type="date" value={value.planned_delivery_date ?? ''} onChange={(e) => set('planned_delivery_date', nullableText(e.target.value))} /></Field>
      </div>
      <Field label="Notering"><textarea rows={3} value={value.planning_note ?? ''} onChange={(e) => set('planning_note', nullableText(e.target.value))} /></Field>
      <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>Reg.nr, modell, bilmärke och planerad station speglas direkt i Nybils ordinarie fält och kan ändras där.</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 }}><span>{label}</span>{children}</label>;
}

const boxStyle: React.CSSProperties = {
  maxWidth: 980,
  margin: '0 auto 14px',
  padding: '16px',
  borderRadius: 12,
  border: '1px solid #c9c6bd',
  background: 'rgba(250,249,246,0.98)',
  boxSizing: 'border-box',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 10,
  marginTop: 14,
  marginBottom: 10,
};
