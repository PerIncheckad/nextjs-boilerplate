'use client';

import { useEffect, useMemo, useState } from 'react';

type GarageCandidate = {
  garage_item_id: string;
  regnr: string | null;
  model: string;
  planned_station: string | null;
  supplier: string | null;
  order_reference: string | null;
  planned_delivery_date: string | null;
  source_kind: string;
  source_planning_unit_no: number | null;
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

function formatDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}` : value;
}

function candidateLabel(item: GarageCandidate) {
  const parts = [item.regnr || 'SAKNAR REGNR', item.model];
  if (item.source_kind === 'PLANERING' && item.source_planning_unit_no) {
    parts.push(`Planering enhet ${item.source_planning_unit_no}`);
  } else if (item.source_kind) {
    parts.push(item.source_kind);
  }
  const arrival = formatDate(item.planned_delivery_date);
  if (arrival) parts.push(`Förväntad ankomst ${arrival}`);
  if (item.planned_station) parts.push(`Stn ${item.planned_station}`);
  return parts.join(' — ');
}

export default function GaragePicker() {
  const [items, setItems] = useState<GarageCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGarageItemId, setSelectedGarageItemId] = useState('');
  const [hasSelectedGarageItem, setHasSelectedGarageItem] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('garage_item_id')) {
      const timer = window.setTimeout(() => {
        setHasSelectedGarageItem(true);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
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

  const selected = useMemo(
    () => items.find((item) => item.garage_item_id === selectedGarageItemId) ?? null,
    [items, selectedGarageItemId],
  );

  if (hasSelectedGarageItem) return null;

  const openSelected = () => {
    if (!selectedGarageItemId) return;
    window.location.href = `/nybil?garage_item_id=${encodeURIComponent(selectedGarageItemId)}`;
  };

  return (
    <section style={shell} aria-label="Hämta bil från Garaget">
      <div>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.06em' }}>NY BIL / GARAGET</div>
        <h2 style={{ margin: '2px 0 0', fontSize: 22 }}>Hämta bilen från Garaget</h2>
        <p style={{ margin: '4px 0 12px', color: '#555', fontSize: 13 }}>
          Välj exakt Garage-objekt. Reg.nr visas när det finns; saknas det används fortfarande Garage-objektets ID som källa.
        </p>
      </div>

      {error ? <div style={{ marginBottom: 10, color: '#a40000', fontWeight: 700 }}>{error}</div> : null}
      {loading ? <div style={{ padding: '10px 0', color: '#666' }}>Läser Garaget…</div> : null}
      {!loading && !error && items.length === 0 ? <div style={{ padding: '10px 0', color: '#666' }}>Inga Garage IN-objekt väntar på Ny bil.</div> : null}

      {!loading && !error && items.length > 0 ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 5, flex: '1 1 520px' }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>Garage IN → väntar på Nybil</span>
            <select
              value={selectedGarageItemId}
              onChange={(event) => setSelectedGarageItemId(event.target.value)}
              aria-label="Välj Garage-objekt"
              style={{ width: '100%', padding: '9px 10px', border: '1px solid #bbb', borderRadius: 6, fontSize: 14 }}
            >
              <option value="">Välj bil…</option>
              {items.map((item) => (
                <option key={item.garage_item_id} value={item.garage_item_id}>{candidateLabel(item)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={openSelected}
            disabled={!selectedGarageItemId}
            style={{ borderRadius: 6, padding: '9px 14px', background: '#111', color: '#fff', fontWeight: 800, border: 0, opacity: selectedGarageItemId ? 1 : 0.45 }}
          >
            Hämta
          </button>
        </div>
      ) : null}

      {selected ? (
        <div style={{ marginTop: 8, color: '#666', fontSize: 12 }}>
          Vald källa: {selected.regnr || 'SAKNAR REGNR'} · {selected.model} · Garage-ID {selected.garage_item_id}
        </div>
      ) : null}
    </section>
  );
}
