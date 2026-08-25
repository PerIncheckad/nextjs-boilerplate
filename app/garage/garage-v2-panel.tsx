'use client';

import { useCallback, useEffect, useState } from 'react';

type GarageDirection = 'IN' | 'UT';
type Station = { station_code: string; display_name: string | null; sort_order: number };
type Lager1Source = {
  period_id: string;
  regnr: string;
  period_type: string;
  started_at: string;
  reason_code: string | null;
  reason_text: string | null;
  source_event_id: string | null;
  brand: string | null;
  model: string | null;
  imported: boolean;
  garage_item_id: string | null;
};
type HandoffItem = {
  garage_item_id: string;
  regnr: string;
  vin: string | null;
  model: string;
  planned_station: string | null;
  supplier: string | null;
  order_reference: string | null;
  source_kind: string;
  garage_direction: 'IN';
  handed_off_nybil_id: string | null;
  handed_off_at: string | null;
};

const shell: React.CSSProperties = {
  maxWidth: 1500,
  margin: '0 auto 20px',
  padding: '18px',
  border: '1px solid #d7d7d7',
  borderRadius: 14,
  background: 'rgba(255,255,255,0.96)',
  boxShadow: '0 6px 24px rgba(0,0,0,0.06)',
};
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 16 };
const panel: React.CSSProperties = { border: '1px solid #e3e3e3', borderRadius: 12, padding: 14, minWidth: 0 };
const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(110px,1fr) minmax(130px,1.4fr) auto', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid #eee' };
const button: React.CSSProperties = { border: 0, borderRadius: 8, padding: '9px 12px', fontWeight: 700, cursor: 'pointer', background: '#111', color: '#fff', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' };
const secondary: React.CSSProperties = { ...button, background: '#ececec', color: '#111' };
const select: React.CSSProperties = { padding: '9px 10px', border: '1px solid #ccc', borderRadius: 8, background: '#fff' };

export default function GarageV2Panel() {
  const [lager1, setLager1] = useState<Lager1Source[]>([]);
  const [handoffs, setHandoffs] = useState<HandoffItem[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [station, setStation] = useState('');
  const [direction, setDirection] = useState<GarageDirection>('IN');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lager1Response, handoffResponse] = await Promise.all([
        fetch('/api/garage/lager1-sources', { cache: 'no-store' }),
        fetch('/api/garage/nybil-handoff', { cache: 'no-store' }),
      ]);
      const lager1Payload = await lager1Response.json();
      const handoffPayload = await handoffResponse.json();
      if (!lager1Response.ok) throw new Error(lager1Payload?.error ?? 'Kunde inte läsa Lager 1');
      if (!handoffResponse.ok) throw new Error(handoffPayload?.error ?? 'Kunde inte läsa Garage → Ny bil');
      setLager1(lager1Payload.data ?? []);
      setHandoffs(handoffPayload.data ?? []);
      const nextStations = lager1Payload.stations ?? [];
      setStations(nextStations);
      setStation((current) => current || nextStations[0]?.station_code || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garage v2');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch('/api/garage/lager1-sources', { cache: 'no-store' }),
      fetch('/api/garage/nybil-handoff', { cache: 'no-store' }),
    ])
      .then(async ([lager1Response, handoffResponse]) => {
        const lager1Payload = await lager1Response.json();
        const handoffPayload = await handoffResponse.json();
        if (!lager1Response.ok) throw new Error(lager1Payload?.error ?? 'Kunde inte läsa Lager 1');
        if (!handoffResponse.ok) throw new Error(handoffPayload?.error ?? 'Kunde inte läsa Garage → Ny bil');
        if (!active) return;
        setLager1(lager1Payload.data ?? []);
        setHandoffs(handoffPayload.data ?? []);
        const nextStations = lager1Payload.stations ?? [];
        setStations(nextStations);
        setStation((current) => current || nextStations[0]?.station_code || '');
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garage v2');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const importFromLager1 = async (source: Lager1Source) => {
    if (!station) return setError('Välj station.');
    setBusy(source.period_id);
    setError(null);
    try {
      const response = await fetch('/api/garage/lager1-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: source.period_id, garage_direction: direction, planned_station: station }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte lägga bilen i Garaget');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kunde inte lägga bilen i Garaget');
    } finally {
      setBusy(null);
    }
  };

  const availableSources = lager1.filter((source) => !source.imported);

  return (
    <section style={shell} aria-label="Garage v2">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>GARAGE V2</div>
          <h2 style={{ margin: '3px 0 0' }}>Fordonsöverlämningar</h2>
          <p style={{ margin: '5px 0 0', color: '#555' }}>Lager 1 behåller verkligheten. Garaget styr dispositionen. Ny bil verifierar faktisk mottagning.</p>
        </div>
        <button type="button" style={secondary} onClick={() => void load()} disabled={loading}>{loading ? 'Läser…' : 'Uppdatera'}</button>
      </div>

      {error ? <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: '#fff1f1', color: '#a40000', fontWeight: 650 }}>{error}</div> : null}

      <div style={grid}>
        <div style={panel}>
          <h3 style={{ marginTop: 0 }}>Lager 1 → Lägg i Garaget</h3>
          <p style={{ color: '#666', marginTop: -4 }}>Skapar en Garage-disposition som refererar till aktuell Lager 1-period. Lager 1 ändras inte.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, fontWeight: 700 }}>Riktning</span><select style={select} value={direction} onChange={(e) => setDirection(e.target.value as GarageDirection)}><option value="IN">UTVECKLA / IN</option><option value="UT">AVVECKLA / UT</option></select></label>
            <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, fontWeight: 700 }}>Station</span><select style={select} value={station} onChange={(e) => setStation(e.target.value)}><option value="">Välj</option>{stations.map((value) => <option key={value.station_code} value={value.station_code}>{value.display_name || value.station_code}</option>)}</select></label>
          </div>
          {availableSources.length === 0 ? <div style={{ color: '#666', padding: '10px 0' }}>{loading ? 'Läser Lager 1…' : 'Inga öppna Lager 1-perioder kvar att lägga i Garaget.'}</div> : availableSources.map((source) => (
            <div key={source.period_id} style={row}>
              <div><strong>{source.regnr}</strong><div style={{ fontSize: 12, color: '#666' }}>{source.period_type}</div></div>
              <div><strong>{[source.brand, source.model].filter(Boolean).join(' ') || 'Modell saknas'}</strong><div style={{ fontSize: 12, color: '#666' }}>{source.reason_text || source.reason_code || `Start ${new Date(source.started_at).toLocaleString('sv-SE')}`}</div></div>
              <button type="button" style={button} disabled={busy === source.period_id || !source.model} onClick={() => void importFromLager1(source)}>{busy === source.period_id ? 'Lägger…' : 'Lägg i Garaget'}</button>
            </div>
          ))}
        </div>

        <div style={panel}>
          <h3 style={{ marginTop: 0 }}>Garage → Ny bil</h3>
          <p style={{ color: '#666', marginTop: -4 }}>Endast UTVECKLA / IN med känt regnr. Överlämningen skapar inte Lager 1; Ny bil-kontrollen gör det när den sparas.</p>
          {handoffs.length === 0 ? <div style={{ color: '#666', padding: '10px 0' }}>{loading ? 'Läser Garaget…' : 'Inga IN-bilar med regnr att överlämna.'}</div> : handoffs.map((item) => (
            <div key={item.garage_item_id} style={row}>
              <div><strong>{item.regnr}</strong><div style={{ fontSize: 12, color: '#666' }}>{item.source_kind}</div></div>
              <div><strong>{item.model}</strong><div style={{ fontSize: 12, color: '#666' }}>Stn {item.planned_station || '—'}{item.order_reference ? ` · Order ${item.order_reference}` : ''}</div></div>
              {item.handed_off_nybil_id ? <div style={{ fontWeight: 750, color: '#176b33' }}>Överlämnad</div> : <a style={button} href={`/nybil?garage_item_id=${encodeURIComponent(item.garage_item_id)}`}>Överlämna till Ny bil</a>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
