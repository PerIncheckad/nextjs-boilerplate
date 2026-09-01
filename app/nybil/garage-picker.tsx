'use client';

import { useEffect, useMemo, useState } from 'react';

type GarageCandidate = {
  garage_item_id: string;
  regnr: string;
  model: string;
  planned_station: string | null;
  supplier: string | null;
  order_reference: string | null;
  handed_off_nybil_id: string | null;
  existing_nybil_id: string | null;
};

const shell: React.CSSProperties = {
  maxWidth: 900,
  margin: '0 auto 14px',
  padding: '12px 14px',
  border: '1px solid #d7d7d7',
  borderRadius: 10,
  background: '#fff',
  boxSizing: 'border-box',
};

const row: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(110px,150px) minmax(180px,1fr) minmax(100px,140px) auto',
  gap: 12,
  alignItems: 'center',
  padding: '9px 0',
  borderTop: '1px solid #e7e7e7',
  fontSize: 14,
};

const button: React.CSSProperties = {
  borderRadius: 6,
  padding: '8px 12px',
  background: '#111',
  color: '#fff',
  fontWeight: 800,
  fontSize: 13,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

export default function GaragePicker() {
  const [items, setItems] = useState<GarageCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hasSelectedGarageItem, setHasSelectedGarageItem] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('garage_item_id')) {
      setHasSelectedGarageItem(true);
      setLoading(false);
      return;
    }

    let active = true;
    void fetch('/api/garage/nybil-handoff', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa bilar från Garaget');
        if (!active) return;
        setItems((payload.data ?? []).filter((item: GarageCandidate) => !item.handed_off_nybil_id && !item.existing_nybil_id));
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa bilar från Garaget');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('sv-SE');
    if (!needle) return items;
    return items.filter((item) => [item.regnr, item.model, item.planned_station, item.supplier, item.order_reference]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('sv-SE').includes(needle)));
  }, [items, query]);

  if (hasSelectedGarageItem) return null;

  return (
    <section style={shell} aria-label="Hämta bil från Garaget">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.06em' }}>NY BIL / GARAGET</div>
          <h2 style={{ margin: '2px 0 0', fontSize: 22 }}>Hämta bilen från Garaget</h2>
          <p style={{ margin: '4px 0 0', color: '#555', fontSize: 13 }}>Välj den bil som har anlänt. Kända Garage-uppgifter följer med som förifyllnad; faktisk mottagning verifieras i Ny bil.</p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Sök reg.nr, modell, station…"
          aria-label="Sök bil i Garaget"
          style={{ minWidth: 245, padding: '8px 10px', border: '1px solid #bbb', borderRadius: 6, fontSize: 14 }}
        />
      </div>

      {error ? <div style={{ marginTop: 10, color: '#a40000', fontWeight: 700 }}>{error}</div> : null}
      {loading ? <div style={{ padding: '10px 0', color: '#666' }}>Läser Garaget…</div> : null}
      {!loading && !error && visible.length === 0 ? <div style={{ padding: '10px 0', color: '#666' }}>Inga ankommande UTVECKLA-bilar med reg.nr väntar på Ny bil.</div> : null}

      {!loading && !error ? visible.map((item) => (
        <div key={item.garage_item_id} style={row}>
          <strong>{item.regnr}</strong>
          <div><strong>{item.model}</strong><div style={{ color: '#666', fontSize: 12 }}>{item.supplier || 'Leverantör ej angiven'}{item.order_reference ? ` · ${item.order_reference}` : ''}</div></div>
          <div>Stn {item.planned_station || '—'}</div>
          <a style={button} href={`/nybil?garage_item_id=${encodeURIComponent(item.garage_item_id)}`}>Hämta</a>
        </div>
      )) : null}
    </section>
  );
}
