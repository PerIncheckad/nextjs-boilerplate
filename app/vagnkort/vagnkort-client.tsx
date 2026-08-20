'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type JourneyPeriod = {
  period_id: string;
  period_type: string;
  started_at: string;
  ended_at: string | null;
  reason_code: string | null;
  reason_text: string | null;
  durationHours: number | null;
};

type JourneyEvent = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  source_system: string;
  actor_name: string | null;
};

type VehicleDocument = {
  document_id: string;
  document_type: string;
  title: string | null;
  file_name: string;
  external_url: string | null;
  uploaded_at: string;
  sourceKind: 'vehicle_document' | 'legacy_receipt';
};

type Damage = {
  id: string;
  source: string;
  damage_type_raw: string | null;
  damage_date: string | null;
  legacy_damage_source_text: string | null;
};

type EquipmentState = {
  keys?: number | null;
  chargingCables?: number | null;
  privacyCovers?: number | null;
  instructionBook?: boolean | null;
  instructionBookLocation?: string | null;
  coc?: boolean | null;
  cocLocation?: string | null;
  wheelLocks?: boolean | null;
  towbar?: boolean | null;
  rubberMats?: boolean | null;
  tireCompressor?: boolean | null;
  mountedWheels?: string | null;
  looseWheels?: string | null;
  hasWinterWheels?: boolean | null;
  hasSummerWheels?: boolean | null;
};

type JourneyResponse = {
  found: boolean;
  regnr: string;
  identity: { brand: string | null; model: string | null };
  baseline: Record<string, unknown> | null;
  current: {
    vehicle: Record<string, unknown> | null;
    latestCheckin: Record<string, unknown> | null;
    equipment: EquipmentState | null;
  };
  equipment: {
    baseline: EquipmentState | null;
    current: EquipmentState | null;
  };
  damages: Damage[];
  journey: {
    events: JourneyEvent[];
    periods: JourneyPeriod[];
    openPeriods: JourneyPeriod[];
    totalHoursByType: Record<string, number>;
  };
  documents: VehicleDocument[];
  salu: {
    state: Record<string, unknown> | null;
    latestFlag: Record<string, unknown> | null;
    checkpoints: Array<Record<string, unknown>>;
    childProcesses: Array<Record<string, unknown>>;
  };
};

type ApiResponse = { data?: JourneyResponse; error?: string };

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.96)',
  borderRadius: 14,
  padding: '1rem 1.1rem',
  boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: '1rem',
};

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('sv-SE');
}

function hours(value: number | undefined) {
  if (!value) return '0 h';
  if (value >= 24) return `${Math.round((value / 24) * 10) / 10} dygn`;
  return `${value} h`;
}

function present(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  return String(value);
}

const equipmentRows: Array<[keyof EquipmentState, string]> = [
  ['keys', 'Nycklar'],
  ['chargingCables', 'Laddkablar'],
  ['privacyCovers', 'Insynsskydd / hatthylla'],
  ['instructionBook', 'Instruktionsbok'],
  ['coc', 'COC'],
  ['wheelLocks', 'Låsbultar'],
  ['towbar', 'Dragkrok'],
  ['rubberMats', 'Gummimattor'],
  ['tireCompressor', 'Däckkompressor'],
  ['mountedWheels', 'Monterade hjul'],
  ['looseWheels', 'Lösa hjul'],
];

export default function VagnkortClient() {
  const [input, setInput] = useState('');
  const [activeRegnr, setActiveRegnr] = useState('');
  const [data, setData] = useState<JourneyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('reg') ?? '';
    if (initial) {
      const normalized = initial.toUpperCase().replace(/\s+/g, '');
      setInput(normalized);
      setActiveRegnr(normalized);
    }
  }, []);

  useEffect(() => {
    if (!activeRegnr) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/vehicle-journey?reg=${encodeURIComponent(activeRegnr)}`);
        const body = (await response.json()) as ApiResponse;
        if (!response.ok) throw new Error(body.error || 'Kunde inte hämta Vagnkortet');
        if (!cancelled) setData(body.data ?? null);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Kunde inte hämta Vagnkortet');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeRegnr]);

  const equipmentDiffs = useMemo(() => {
    const baseline = data?.equipment.baseline;
    const current = data?.equipment.current;
    if (!baseline || !current) return [];
    return equipmentRows.map(([key, label]) => ({
      key,
      label,
      baseline: baseline[key],
      current: current[key],
      changed: baseline[key] !== undefined && current[key] !== undefined && baseline[key] !== current[key],
    }));
  }, [data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = input.toUpperCase().replace(/\s+/g, '');
    if (!normalized) return;
    setActiveRegnr(normalized);
    window.history.replaceState(null, '', `/vagnkort?reg=${encodeURIComponent(normalized)}`);
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f2f4f5', padding: '1.5rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.08em', color: '#666' }}>Bilens digitala pärm</div>
            <h1 style={{ margin: '.2rem 0 0' }}>Vagnkort</h1>
          </div>
          <a href="/" style={{ color: '#111' }}>Till startsidan</a>
        </div>

        <form onSubmit={submit} style={{ ...card, display: 'flex', gap: '.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value.toUpperCase())}
            placeholder="REG.NR"
            autoComplete="off"
            style={{ flex: '1 1 220px', padding: '.8rem', borderRadius: 8, border: '1px solid #bbb', fontSize: 16, textTransform: 'uppercase' }}
          />
          <button type="submit" style={{ padding: '.8rem 1.25rem', border: 0, borderRadius: 8, background: '#111', color: '#fff', fontWeight: 700 }}>Öppna Vagnkort</button>
        </form>

        {loading && <div style={card}>Hämtar bilens resa…</div>}
        {error && <div style={{ ...card, color: '#a00' }}>{error}</div>}
        {!loading && data && !data.found && <div style={card}>Ingen fordonsdata hittades för {data.regnr}.</div>}

        {!loading && data?.found && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <section style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 30, fontWeight: 800 }}>{data.regnr}</div>
                  <div style={{ color: '#555' }}>{[data.identity.brand, data.identity.model].filter(Boolean).join(' ') || 'Modell saknas'}</div>
                </div>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  <span style={{ background: '#eee', borderRadius: 999, padding: '.35rem .7rem' }}>{data.damages.length} skador</span>
                  <span style={{ background: '#eee', borderRadius: 999, padding: '.35rem .7rem' }}>{data.documents.length} dokument</span>
                  <span style={{ background: '#eee', borderRadius: 999, padding: '.35rem .7rem' }}>{data.journey.openPeriods.length} öppna perioder</span>
                </div>
              </div>
            </section>

            <div style={grid}>
              <section style={card}>
                <h2 style={{ marginTop: 0 }}>Tid i resan</h2>
                {Object.keys(data.journey.totalHoursByType).length === 0 ? <p>Inga perioder registrerade ännu.</p> : Object.entries(data.journey.totalHoursByType).map(([type, total]) => (
                  <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '.45rem 0', borderBottom: '1px solid #eee' }}>
                    <span>{type}</span><strong>{hours(total)}</strong>
                  </div>
                ))}
              </section>

              <section style={card}>
                <h2 style={{ marginTop: 0 }}>SALU</h2>
                <div><strong>Status:</strong> {present(data.salu.latestFlag?.status)}</div>
                <div><strong>SALU-datum:</strong> {present(data.salu.state?.current_saludatum)}</div>
                <div><strong>Eskalering:</strong> {present(data.salu.latestFlag?.escalation_status)}</div>
                <div><strong>Checkpoints:</strong> {data.salu.checkpoints.length}</div>
                <div><strong>Barnprocesser:</strong> {data.salu.childProcesses.length}</div>
              </section>
            </div>

            <section style={card}>
              <h2 style={{ marginTop: 0 }}>Utrustning – Nybil mot nu</h2>
              {!equipmentDiffs.length ? <p>Jämförelseunderlag saknas.</p> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={{ textAlign: 'left', padding: '.5rem' }}>Attribut</th><th style={{ textAlign: 'left', padding: '.5rem' }}>Nybil</th><th style={{ textAlign: 'left', padding: '.5rem' }}>Nu</th><th style={{ textAlign: 'left', padding: '.5rem' }}>Status</th></tr></thead>
                    <tbody>{equipmentDiffs.map((row) => (
                      <tr key={String(row.key)} style={{ background: row.changed ? '#fff2db' : undefined }}>
                        <td style={{ padding: '.55rem', borderTop: '1px solid #eee' }}>{row.label}</td>
                        <td style={{ padding: '.55rem', borderTop: '1px solid #eee' }}>{present(row.baseline)}</td>
                        <td style={{ padding: '.55rem', borderTop: '1px solid #eee' }}>{present(row.current)}</td>
                        <td style={{ padding: '.55rem', borderTop: '1px solid #eee', fontWeight: row.changed ? 700 : 400 }}>{row.changed ? 'Förändrat' : 'Oförändrat'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>

            <div style={grid}>
              <section style={card}>
                <h2 style={{ marginTop: 0 }}>Skador</h2>
                {data.damages.length === 0 ? <p>Inga registrerade skador.</p> : data.damages.slice(0, 10).map((damage) => (
                  <div key={damage.id} style={{ padding: '.55rem 0', borderBottom: '1px solid #eee' }}>
                    <strong>{damage.damage_type_raw || damage.legacy_damage_source_text || 'Skada'}</strong>
                    <div style={{ color: '#666', fontSize: 13 }}>{damage.source} · {formatDate(damage.damage_date)}</div>
                  </div>
                ))}
              </section>

              <section style={card}>
                <h2 style={{ marginTop: 0 }}>Dokument</h2>
                {data.documents.length === 0 ? <p>Inga dokument registrerade ännu.</p> : data.documents.slice(0, 12).map((document) => (
                  <div key={document.document_id} style={{ padding: '.55rem 0', borderBottom: '1px solid #eee' }}>
                    {document.external_url ? <a href={document.external_url} target="_blank" rel="noreferrer"><strong>{document.title || document.file_name}</strong></a> : <strong>{document.title || document.file_name}</strong>}
                    <div style={{ color: '#666', fontSize: 13 }}>{document.document_type} · {formatDate(document.uploaded_at)}</div>
                  </div>
                ))}
              </section>
            </div>

            <section style={card}>
              <h2 style={{ marginTop: 0 }}>Tidslinje</h2>
              {data.journey.events.length === 0 && data.journey.periods.length === 0 ? <p>Fordonsresan har ännu inga nya händelser eller perioder.</p> : (
                <>
                  {data.journey.events.slice(0, 15).map((event) => (
                    <div key={event.event_id} style={{ padding: '.6rem 0', borderBottom: '1px solid #eee' }}>
                      <strong>{event.event_type}</strong>
                      <div style={{ color: '#666', fontSize: 13 }}>{formatDate(event.occurred_at)} · {event.source_system}{event.actor_name ? ` · ${event.actor_name}` : ''}</div>
                    </div>
                  ))}
                  {data.journey.periods.slice(0, 15).map((period) => (
                    <div key={period.period_id} style={{ padding: '.6rem 0', borderBottom: '1px solid #eee' }}>
                      <strong>{period.period_type}</strong> {period.ended_at === null && <span style={{ color: '#a00' }}>· pågår</span>}
                      <div style={{ color: '#666', fontSize: 13 }}>{formatDate(period.started_at)} → {formatDate(period.ended_at)}{period.durationHours !== null ? ` · ${hours(period.durationHours)}` : ''}</div>
                      {(period.reason_text || period.reason_code) && <div>{period.reason_text || period.reason_code}</div>}
                    </div>
                  ))}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
