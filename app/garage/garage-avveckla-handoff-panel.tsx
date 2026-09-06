'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type GarageItem = {
  garage_item_id: string;
  regnr: string | null;
  model: string;
  planned_station: string | null;
};

type AvvecklaCase = {
  avveckla_case_id: string;
  garage_item_id: string;
  regnr: string;
  reason: string;
  status: 'OPEN' | 'COMPLETED';
  started_at: string;
};

type AvvecklaPoint = { point_id: string; status: 'OPEN' | 'CLOSED' };
type Detail = { case: AvvecklaCase | null; points: AvvecklaPoint[] };

const shell: React.CSSProperties = { width: '100%', margin: 0, padding: '12px 14px', border: '1px solid #d7d7d7', borderRadius: 8, background: '#fff', boxSizing: 'border-box' };
const input: React.CSSProperties = { padding: '7px 9px', border: '1px solid #cfcfcf', borderRadius: 6, fontSize: 13, minWidth: 180 };
const button: React.CSSProperties = { padding: '7px 10px', border: '1px solid #111', borderRadius: 6, background: '#111', color: '#fff', cursor: 'pointer', fontWeight: 700, textDecoration: 'none', display: 'inline-block' };

export default function GarageAvvecklaHandoffPanel() {
  const [items, setItems] = useState<GarageItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail>({ case: null, points: [] });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/garage?direction=UT', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { data?: GarageItem[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa Garage UT');
        if (!active) return;
        const next = body.data ?? [];
        setItems(next);
        setSelectedId(next[0]?.garage_item_id ?? '');
      })
      .catch((reasonValue: unknown) => { if (active) setError(reasonValue instanceof Error ? reasonValue.message : 'Kunde inte läsa Garage UT'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void fetch(`/api/garage/avveckla?garage_item_id=${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { data?: Detail; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Kunde inte läsa AVVECKLA-status');
        if (active) setDetail(body.data ?? { case: null, points: [] });
      })
      .catch((reasonValue: unknown) => { if (active) setError(reasonValue instanceof Error ? reasonValue.message : 'Kunde inte läsa AVVECKLA-status'); });
    return () => { active = false; };
  }, [selectedId]);

  const selected = useMemo(() => items.find((item) => item.garage_item_id === selectedId) ?? null, [items, selectedId]);
  const openCount = detail.points.filter((point) => point.status === 'OPEN').length;

  const selectGarageItem = (garageItemId: string) => {
    setSelectedId(garageItemId);
    setError(null);
    if (!garageItemId) setDetail({ case: null, points: [] });
  };

  const startCase = async () => {
    if (!selectedId || !reason.trim()) return setError('Ange orsak för att starta AVVECKLA.');
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/garage/avveckla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'START_CASE', garage_item_id: selectedId, reason }),
      });
      const body = await response.json() as { data?: { avveckla_case_id?: string }; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Kunde inte starta AVVECKLA');
      const verifyResponse = await fetch(`/api/garage/avveckla?garage_item_id=${encodeURIComponent(selectedId)}`, { cache: 'no-store' });
      const verifyBody = await verifyResponse.json() as { data?: Detail; error?: string };
      if (!verifyResponse.ok || !verifyBody.data?.case?.avveckla_case_id) throw new Error(verifyBody.error ?? 'AVVECKLA startades men handoff kunde inte verifieras');
      setDetail(verifyBody.data);
      setReason('');
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Kunde inte starta AVVECKLA');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={shell} aria-label="Garage till AVVECKLA handoff">
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.06em' }}>GARAGE / UT / HANDOFF</div>
      <h2 aria-label="Starta AVVECKLA" style={{ margin: '2px 0 0', fontSize: 24 }}>STARTA AVVECKLA</h2>
      <p style={{ margin: '3px 0 10px', color: '#50565a', fontSize: 14 }}>Garage initierar AVVECKLA manuellt. När ett verkligt avveckla_case_id finns är handslaget verifierat och fortsatt arbete sker i AVVECKLA-modulen.</p>

      {error ? <div style={{ marginBottom: 10, padding: 9, borderRadius: 6, background: '#fff1f1', color: '#a40000', fontWeight: 700, fontSize: 13 }}>{error}</div> : null}

      <label><span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 2 }}>GARAGE UT-OBJEKT</span><select aria-label="Garage UT-objekt" style={input} value={selectedId} onChange={(event) => selectGarageItem(event.target.value)}><option value="">Välj bil</option>{items.map((item) => <option key={item.garage_item_id} value={item.garage_item_id}>{item.regnr || 'Regnr saknas'} · {item.model} · {item.planned_station || '—'}</option>)}</select></label>

      {!selected ? <div style={{ marginTop: 9, color: '#666', fontSize: 13 }}>Ingen Garage UT-bil vald.</div> : detail.case ? (
        <div style={{ marginTop: 10, border: '1px solid #e1e1e1', borderRadius: 7, padding: '9px 10px' }}>
          <strong>{detail.case.regnr} · AVVECKLA {detail.case.status}</strong>
          <div style={{ marginTop: 3, fontSize: 13, color: '#555' }}>Verifierat handoff: <code>{detail.case.avveckla_case_id}</code></div>
          <div style={{ marginTop: 3, fontSize: 13, color: '#555' }}>Read-only status i Garage: {openCount} öppen punkt(er).</div>
          <div style={{ marginTop: 8 }}><Link aria-label="Öppna AVVECKLA" href={`/avveckla?garage_item_id=${encodeURIComponent(selectedId)}`} style={button}>ÖPPNA AVVECKLA →</Link></div>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ flex: '1 1 320px' }}><span style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 2 }}>ORSAK</span><input aria-label="Orsak" style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Varför AVVECKLA startas" /></label>
          <button aria-label="Starta AVVECKLA" type="button" style={button} disabled={busy} onClick={() => void startCase()}>{busy ? 'STARTAR…' : 'STARTA AVVECKLA'}</button>
        </div>
      )}
    </section>
  );
}
