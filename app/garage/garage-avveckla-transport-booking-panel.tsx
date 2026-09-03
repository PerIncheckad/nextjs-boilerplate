'use client';

import { useEffect, useState } from 'react';

type GarageItem = {
  garage_item_id: string;
  regnr: string | null;
  model: string;
  planned_station: string | null;
};

type TransportBooking = {
  booking_id: string;
  garage_item_id: string;
  regnr: string;
  booked_at: string;
  deadline_at: string;
  booking_reference: string | null;
  picked_up_at: string | null;
  deviation_at: string | null;
  alert_at: string | null;
};

type AvvecklaDetail = { case: { status: 'OPEN' | 'COMPLETED' } | null };

const shell: React.CSSProperties = { width: '100%', marginTop: 10, padding: '12px 14px', border: '1px solid #d7d7d7', borderRadius: 8, background: '#fff', boxSizing: 'border-box' };
const input: React.CSSProperties = { padding: '7px 9px', border: '1px solid #cfcfcf', borderRadius: 6, fontSize: 13, minWidth: 180 };
const button: React.CSSProperties = { padding: '7px 10px', border: '1px solid #111', borderRadius: 6, background: '#111', color: '#fff', cursor: 'pointer', fontWeight: 700 };

function localNowInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('sv-SE');
}

export default function GarageAvvecklaTransportBookingPanel() {
  const [items, setItems] = useState<GarageItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [hasOpenCase, setHasOpenCase] = useState(false);
  const [booking, setBooking] = useState<TransportBooking | null>(null);
  const [bookedAt, setBookedAt] = useState(localNowInput);
  const [bookingReference, setBookingReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSelected = async (garageItemId: string) => {
    if (!garageItemId) return;

    const [caseResponse, bookingResponse] = await Promise.all([
      fetch(`/api/garage/avveckla?garage_item_id=${encodeURIComponent(garageItemId)}`, { cache: 'no-store' }),
      fetch(`/api/garage/avveckla/transport?garage_item_id=${encodeURIComponent(garageItemId)}`, { cache: 'no-store' }),
    ]);
    const caseBody = await caseResponse.json() as { data?: AvvecklaDetail; error?: string };
    const bookingBody = await bookingResponse.json() as { data?: TransportBooking | null; error?: string };
    if (!caseResponse.ok) throw new Error(caseBody.error ?? 'Kunde inte läsa AVVECKLA-ärendet');
    if (!bookingResponse.ok) throw new Error(bookingBody.error ?? 'Kunde inte läsa transportbokningen');
    setHasOpenCase(caseBody.data?.case?.status === 'OPEN');
    setBooking(bookingBody.data ?? null);
  };

  useEffect(() => {
    let active = true;
    void fetch('/api/garage?direction=UT', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { data?: GarageItem[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa AVVECKLA-bilar');
        if (!active) return;
        const next = body.data ?? [];
        setItems(next);
        setSelectedId(next[0]?.garage_item_id ?? '');
      })
      .catch((reasonValue: unknown) => { if (active) setError(reasonValue instanceof Error ? reasonValue.message : 'Kunde inte läsa AVVECKLA-bilar'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadSelected(selectedId).catch((reasonValue: unknown) => {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Kunde inte läsa transportbokningen');
    });
  }, [selectedId]);

  const selectGarageItem = (garageItemId: string) => {
    setError(null);
    setHasOpenCase(false);
    setBooking(null);
    setBookedAt(localNowInput());
    setBookingReference('');
    setSelectedId(garageItemId);
  };

  const registerBooking = async () => {
    if (!selectedId || !bookedAt) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/garage/avveckla/transport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ garage_item_id: selectedId, booked_at: bookedAt, booking_reference: bookingReference }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Kunde inte registrera transportbokningen');
      await loadSelected(selectedId);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Kunde inte registrera transportbokningen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={shell} aria-label="Extern transportbokning">
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.06em' }}>AVVECKLA / EXTERN TRANSPORT</div>
      <h3 style={{ margin: '2px 0 0', fontSize: 20 }}>TRANSPORT_BOKAD · 5-dygnsklocka</h3>
      <p style={{ margin: '3px 0 10px', color: '#50565a', fontSize: 13 }}>Registrera den verkliga bokningstidpunkten. Deadline fryses till exakt bokningstid + 5 dygn. Faktisk hämtning verifieras senare i ordinarie UT-handslag.</p>

      {error ? <div style={{ marginBottom: 10, padding: 9, borderRadius: 6, background: '#fff1f1', color: '#a40000', fontWeight: 700, fontSize: 13 }}>{error}</div> : null}

      <label><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 2 }}>AVVECKLA-bil</span><select style={input} value={selectedId} onChange={(event) => selectGarageItem(event.target.value)}><option value="">Välj bil</option>{items.map((item) => <option key={item.garage_item_id} value={item.garage_item_id}>{item.regnr || 'Regnr saknas'} · {item.model} · {item.planned_station || '—'}</option>)}</select></label>

      {selectedId && !hasOpenCase ? <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>Starta AVVECKLA-ärendet för bilen innan transport bokas.</div> : null}

      {booking ? <div style={{ marginTop: 10, padding: 10, border: '1px solid #dedede', borderRadius: 6 }}>
        <div style={{ fontSize: 13 }}><strong>Bokad:</strong> {formatDateTime(booking.booked_at)}</div>
        <div style={{ fontSize: 13, marginTop: 2 }}><strong>Deadline:</strong> {formatDateTime(booking.deadline_at)}</div>
        {booking.booking_reference ? <div style={{ fontSize: 13, marginTop: 2 }}><strong>Referens:</strong> {booking.booking_reference}</div> : null}
        {booking.picked_up_at ? <div style={{ fontSize: 13, marginTop: 5 }}><strong>Hämtad:</strong> {formatDateTime(booking.picked_up_at)}</div> : null}
        {booking.deviation_at ? <div style={{ fontSize: 13, marginTop: 6, fontWeight: 900, color: '#a40000' }}>AVVIKELSE + LARM · 5 dygn överskridet {formatDateTime(booking.deviation_at)}</div> : <div style={{ fontSize: 12, color: '#666', marginTop: 5 }}>Ingen 5-dygnsavvikelse registrerad.</div>}
      </div> : hasOpenCase ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 10 }}>
        <label><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Verklig bokningstid</span><input type="datetime-local" style={input} value={bookedAt} onChange={(event) => setBookedAt(event.target.value)} /></label>
        <label style={{ flex: '1 1 280px' }}><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Bokningsreferens, frivillig</span><input style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={bookingReference} onChange={(event) => setBookingReference(event.target.value)} placeholder="t.ex. order- eller bokningsnummer" /></label>
        <button type="button" style={button} disabled={busy || !bookedAt} onClick={() => void registerBooking()}>Registrera transportbokning</button>
      </div> : null}
    </section>
  );
}
