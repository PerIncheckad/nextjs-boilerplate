'use client';

import { useEffect, useState } from 'react';

type DraftRow = { regnr: string; updated_at: string };

type DraftResponse = {
  data?: DraftRow[];
  error?: string;
};

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/checkin-drafts');
        const payload = await response.json() as DraftResponse;

        if (!response.ok) {
          throw new Error(payload.error || 'Kunde inte läsa utkast');
        }

        if (!cancelled) {
          setDrafts(payload.data ?? []);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setDrafts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b0b', color: '#e5e7eb' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 20 }}>
        <h1 style={{ fontSize: 24, margin: '12px 0 16px' }}>Påbörjade incheckningar</h1>

        {loading && <p>Laddar…</p>}
        {!loading && drafts.length === 0 && <p>Inga sparade utkast.</p>}

        {!loading && drafts.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {drafts.map((d) => (
              <li key={d.regnr}
                  style={{ display: 'flex', justifyContent: 'space-between',
                           alignItems: 'center', padding: '10px 0',
                           borderBottom: '1px solid #262626' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{d.regnr}</div>
                  <div style={{ fontSize: 12, color: '#a3a3a3' }}>
                    Uppdaterad: {new Date(d.updated_at).toLocaleString('sv-SE')}
                  </div>
                </div>
                <button
                  onClick={() => { window.location.href = `/check?reg=${encodeURIComponent(d.regnr)}`; }}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db',
                           background: 'transparent', color: '#e5e7eb', cursor: 'pointer' }}
                >
                  Fortsätt
                </button>
              </li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: 16 }}>
          <a href="/check" style={{ color: '#93c5fd' }}>← Tillbaka</a>
        </div>
      </div>
    </div>
  );
}
