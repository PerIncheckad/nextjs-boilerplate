'use client';

import { useEffect, useState } from 'react';

type HandoffItem = {
  garage_item_id: string;
  regnr: string;
  model: string;
  planned_station: string | null;
  source_kind: string;
  handed_off_nybil_id: string | null;
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
const row: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(110px,1fr) minmax(130px,1.4fr) auto',
  gap: 10,
  alignItems: 'center',
  padding: '10px 0',
  borderTop: '1px solid #eee',
};
const button: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: '9px 12px',
  fontWeight: 700,
  cursor: 'pointer',
  background: '#111',
  color: '#fff',
  textDecoration: 'none',
  display: 'inline-block',
  whiteSpace: 'nowrap',
};

export default function GarageV2Panel() {
  const [handoffs, setHandoffs] = useState<HandoffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/garage/nybil-handoff', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Garage → Ny bil');
        if (!active) return;
        setHandoffs(payload.data ?? []);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garage → Ny bil');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <section style={shell} aria-label="Garage till Ny bil">
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>GARAGE → NY BIL</div>
        <h2 style={{ margin: '3px 0 0' }}>Överlämna fysisk bil</h2>
        <p style={{ margin: '5px 0 0', color: '#555' }}>När en UTVECKLA-bil har fått registreringsnummer kan den lämnas vidare till Ny bil. Lager 1 importeras inte här.</p>
      </div>

      {error ? <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: '#fff1f1', color: '#a40000', fontWeight: 650 }}>{error}</div> : null}

      {handoffs.length === 0 ? (
        <div style={{ color: '#666', padding: '10px 0' }}>{loading ? 'Läser Garaget…' : 'Inga UTVECKLA-bilar med regnr att överlämna.'}</div>
      ) : handoffs.map((item) => (
        <div key={item.garage_item_id} style={row}>
          <div><strong>{item.regnr}</strong><div style={{ fontSize: 12, color: '#666' }}>{item.source_kind}</div></div>
          <div><strong>{item.model}</strong><div style={{ fontSize: 12, color: '#666' }}>Stn {item.planned_station || '—'}</div></div>
          {item.handed_off_nybil_id ? <div style={{ fontWeight: 750, color: '#176b33' }}>Överlämnad</div> : <a style={button} href={`/nybil?garage_item_id=${encodeURIComponent(item.garage_item_id)}`}>Till Ny bil</a>}
        </div>
      ))}
    </section>
  );
}
