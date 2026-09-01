'use client';

import { useEffect, useMemo, useState } from 'react';

type HandoffItem = {
  garage_item_id: string;
  regnr: string;
  model: string;
  planned_station: string | null;
  source_kind: string;
  handed_off_nybil_id: string | null;
  existing_nybil_id: string | null;
  existing_nybil_created_at: string | null;
};

const shell: React.CSSProperties = {
  width: '100%',
  margin: 0,
  padding: '12px 14px',
  border: '1px solid #d7d7d7',
  borderRadius: 8,
  background: '#fff',
  boxSizing: 'border-box',
};
const row: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(150px,220px) minmax(180px,1fr) auto',
  gap: 16,
  alignItems: 'center',
  padding: '9px 0',
  borderTop: '1px solid #e6e6e6',
  fontSize: 14,
};
const button: React.CSSProperties = {
  border: 0,
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
  background: '#111',
  color: '#fff',
  textDecoration: 'none',
  display: 'inline-block',
  whiteSpace: 'nowrap',
};
const done: React.CSSProperties = { fontWeight: 800, color: '#176b33', fontSize: 13 };
const known: React.CSSProperties = { fontWeight: 800, color: '#71510a', fontSize: 13, textAlign: 'right' };

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

  const counts = useMemo(() => ({
    total: handoffs.length,
    ready: handoffs.filter((item) => !item.handed_off_nybil_id && !item.existing_nybil_id).length,
    alreadyKnown: handoffs.filter((item) => !item.handed_off_nybil_id && Boolean(item.existing_nybil_id)).length,
    handedOff: handoffs.filter((item) => Boolean(item.handed_off_nybil_id)).length,
  }), [handoffs]);

  return (
    <section style={shell} aria-label="Garage till Ny bil">
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.06em' }}>GARAGE → NY BIL</div>
        <h2 style={{ margin: '2px 0 0', fontSize: 24 }}>Överlämna fysisk bil</h2>
        <p style={{ margin: '3px 0 0', color: '#50565a', fontSize: 14 }}>När en UTVECKLA-bil har fått registreringsnummer kan den lämnas vidare till Ny bil. Bilar som redan finns i Ny bil får inte registreras en gång till.</p>
        {!loading ? <div style={{ marginTop: 7, fontSize: 13, color: '#555' }}>{counts.ready} att överlämna · {counts.alreadyKnown} redan i Ny bil · {counts.handedOff} kvitterade</div> : null}
      </div>

      {error ? <div style={{ marginBottom: 10, padding: 9, borderRadius: 6, background: '#fff1f1', color: '#a40000', fontWeight: 700, fontSize: 13 }}>{error}</div> : null}

      {handoffs.length === 0 ? (
        <div style={{ color: '#666', padding: '8px 0', fontSize: 14 }}>{loading ? 'Läser Garaget…' : 'Inga UTVECKLA-bilar med regnr att överlämna.'}</div>
      ) : handoffs.map((item) => (
        <div key={item.garage_item_id} style={row}>
          <div><strong style={{ fontSize: 15 }}>{item.regnr}</strong><div style={{ fontSize: 13, color: '#666' }}>{item.source_kind}</div></div>
          <div><strong style={{ fontSize: 15 }}>{item.model}</strong><div style={{ fontSize: 13, color: '#666' }}>Stn {item.planned_station || '—'}</div></div>
          {item.handed_off_nybil_id ? (
            <div style={done}>Överlämnad</div>
          ) : item.existing_nybil_id ? (
            <div style={known}>Redan i Ny bil<br /><span style={{ fontWeight: 500 }}>{item.existing_nybil_created_at ? new Date(item.existing_nybil_created_at).toLocaleDateString('sv-SE') : 'Registrering finns'}</span></div>
          ) : (
            <a style={button} href={`/nybil?garage_item_id=${encodeURIComponent(item.garage_item_id)}`}>Till Ny bil</a>
          )}
        </div>
      ))}
    </section>
  );
}
