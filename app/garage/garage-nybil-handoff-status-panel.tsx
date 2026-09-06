'use client';

import { useEffect, useMemo, useState } from 'react';

type ExistingNybilTiming = 'BEFORE_GARAGE' | 'AFTER_GARAGE' | 'UNKNOWN' | null;

type HandoffItem = {
  garage_item_id: string;
  regnr: string;
  model: string;
  planned_station: string | null;
  source_kind: string;
  handed_off_nybil_id: string | null;
  existing_nybil_id: string | null;
  existing_nybil_created_at: string | null;
  existing_nybil_timing: ExistingNybilTiming;
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
const done: React.CSSProperties = { fontWeight: 800, color: '#176b33', fontSize: 13 };
const known: React.CSSProperties = { fontWeight: 800, color: '#71510a', fontSize: 13, textAlign: 'right' };
const waiting: React.CSSProperties = { fontWeight: 800, color: '#333', fontSize: 13, textAlign: 'right' };

function knownLabel(item: HandoffItem): string {
  if (item.existing_nybil_timing === 'BEFORE_GARAGE') return 'HISTORISK NYBIL FÖRE GARAGE';
  if (item.existing_nybil_timing === 'AFTER_GARAGE') return 'NYBIL EFTER GARAGE · KOPPLING SAKNAS';
  return 'REDAN I NYBIL · TIDSRELATION OKÄND';
}

export default function GarageNybilHandoffStatusPanel() {
  const [handoffs, setHandoffs] = useState<HandoffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/garage/nybil-handoff', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Garage → Nybil');
        if (!active) return;
        setHandoffs(payload.data ?? []);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa Garage → Nybil');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const counts = useMemo(() => ({
    waiting: handoffs.filter((item) => !item.handed_off_nybil_id && !item.existing_nybil_id).length,
    historicalBefore: handoffs.filter((item) => !item.handed_off_nybil_id && item.existing_nybil_timing === 'BEFORE_GARAGE').length,
    laterWithoutLink: handoffs.filter((item) => !item.handed_off_nybil_id && item.existing_nybil_timing === 'AFTER_GARAGE').length,
    unknownOverlap: handoffs.filter((item) => !item.handed_off_nybil_id && Boolean(item.existing_nybil_id) && item.existing_nybil_timing === 'UNKNOWN').length,
    handedOff: handoffs.filter((item) => Boolean(item.handed_off_nybil_id)).length,
  }), [handoffs]);

  return (
    <section style={shell} aria-label="Garage till Nybil handoff-status">
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.06em' }}>GARAGE → NYBIL</div>
        <h2 style={{ margin: '2px 0 0', fontSize: 24 }}>HANDOFF-STATUS</h2>
        <p style={{ margin: '3px 0 0', color: '#50565a', fontSize: 14 }}>Read-only. Nybil hämtar bilen från Garaget och verifierar faktisk mottagning i /nybil. Ingen Nybil-exekvering sker här.</p>
        {!loading ? (
          <div style={{ marginTop: 7, fontSize: 13, color: '#555' }}>
            {counts.waiting} väntar på Nybil · {counts.historicalBefore} historiska före Garage · {counts.laterWithoutLink} Nybil efter Garage utan koppling · {counts.unknownOverlap} tidsrelation okänd · {counts.handedOff} mottagna i Nybil
          </div>
        ) : null}
      </div>

      {error ? <div style={{ marginBottom: 10, padding: 9, borderRadius: 6, background: '#fff1f1', color: '#a40000', fontWeight: 700, fontSize: 13 }}>{error}</div> : null}

      {handoffs.length === 0 ? (
        <div style={{ color: '#666', padding: '8px 0', fontSize: 14 }}>{loading ? 'Läser Garaget…' : 'Inga UTVECKLA-bilar med regnr finns i Nybil-handslaget.'}</div>
      ) : handoffs.map((item) => (
        <div key={item.garage_item_id} style={row}>
          <div><strong style={{ fontSize: 15 }}>{item.regnr}</strong><div style={{ fontSize: 13, color: '#666' }}>{item.source_kind}</div></div>
          <div><strong style={{ fontSize: 15 }}>{item.model}</strong><div style={{ fontSize: 13, color: '#666' }}>STN {item.planned_station || '—'}</div></div>
          {item.handed_off_nybil_id ? (
            <div style={done}>MOTTAGEN I NYBIL</div>
          ) : item.existing_nybil_id ? (
            <div style={known}>{knownLabel(item)}<br /><span style={{ fontWeight: 500 }}>{item.existing_nybil_created_at ? new Date(item.existing_nybil_created_at).toLocaleDateString('sv-SE') : 'Registrering finns'}</span></div>
          ) : (
            <div style={waiting}>VÄNTAR PÅ NYBIL</div>
          )}
        </div>
      ))}
    </section>
  );
}
