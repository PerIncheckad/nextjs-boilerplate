'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import DocumentUpload from './document-upload';
import EquipmentChangeControls from './equipment-change-controls';
import JourneyMetricsPanel from './journey-metrics-panel';
import JourneyPeriodControls from './journey-period-controls';
import SaluJourneyPanel from './salu-journey-panel';

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

type DocumentSourceFacts = {
  supplier?: string | null;
  invoiceNumber?: string | null;
  documentDate?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
  provenance?: string | null;
  monetaryInterpretation?: boolean | null;
};

type VehicleDocument = {
  document_id: string;
  document_type: string;
  title: string | null;
  file_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  source_system?: string | null;
  external_url: string | null;
  uploaded_at: string;
  journey_event_id?: string | null;
  checkin_id?: string | null;
  damage_id?: string | null;
  salu_flag_id?: string | null;
  salu_checkpoint_id?: string | null;
  salu_child_process_id?: string | null;
  metadata?: {
    contentFingerprint?: string | null;
    fingerprintSource?: string | null;
    sourceFacts?: DocumentSourceFacts | null;
    context?: {
      type?: string;
      id?: string | null;
      label?: string | null;
    };
  } | null;
  sourceKind?: 'vehicle_document' | 'legacy_receipt';
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
  coc?: boolean | null;
  wheelLocks?: boolean | null;
  towbar?: boolean | null;
  rubberMats?: boolean | null;
  tireCompressor?: boolean | null;
  mountedWheels?: string | null;
  looseWheels?: string | null;
};

type EquipmentChange = {
  eventId: string;
  field: keyof EquipmentState;
  value: string | number | boolean | null;
  comment: string | null;
  occurredAt: string;
  actorName: string | null;
  actorEmail: string | null;
};

type JourneyResponse = {
  found: boolean;
  regnr: string;
  identity: { brand: string | null; model: string | null };
  equipment: { baseline: EquipmentState | null; current: EquipmentState | null; changes: EquipmentChange[] };
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

function initialRegnr() {
  if (typeof window === 'undefined') return '';
  return (new URLSearchParams(window.location.search).get('reg') ?? '')
    .toUpperCase()
    .replace(/\s+/g, '');
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('sv-SE');
}

function formatDocumentDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('sv-SE');
}

function formatMoney(value: number | null | undefined, currency = 'SEK') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

function formatFileSize(value: number | null | undefined) {
  if (!value || value < 1) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round((value / 1024) * 10) / 10} KB`;
  return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
}

function hours(value: number | undefined) {
  if (!value) return '0 h';
  return value >= 24 ? `${Math.round((value / 24) * 10) / 10} dygn` : `${value} h`;
}

function present(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  return String(value);
}

function equipmentLabel(field: keyof EquipmentState) {
  return equipmentRows.find(([key]) => key === field)?.[1] ?? String(field);
}

function documentContextLabel(document: VehicleDocument) {
  const metadataLabel = document.metadata?.context?.label?.trim();
  if (metadataLabel) return metadataLabel;
  if (document.damage_id) return 'Skada';
  if (document.salu_checkpoint_id) return 'SALU-checkpoint';
  if (document.salu_child_process_id) return 'SALU-åtgärd';
  if (document.salu_flag_id) return 'SALU';
  if (document.checkin_id) return 'Incheckning';
  if (document.journey_event_id) return 'Resehändelse';
  return 'Bilen generellt';
}

export default function VagnkortClient() {
  const [input, setInput] = useState(initialRegnr);
  const [activeRegnr, setActiveRegnr] = useState(initialRegnr);
  const [data, setData] = useState<JourneyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [openingDocument, setOpeningDocument] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRegnr) return;
    let cancelled = false;

    const load = async () => {
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
    };

    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError('');
      void load();
    });

    return () => { cancelled = true; };
  }, [activeRegnr, refreshNonce]);

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

  const fingerprintCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of data?.documents ?? []) {
      const fingerprint = document.metadata?.contentFingerprint;
      if (!fingerprint) continue;
      counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = input.toUpperCase().replace(/\s+/g, '');
    if (!normalized) return;
    setActiveRegnr(normalized);
    window.history.replaceState(null, '', `/vagnkort?reg=${encodeURIComponent(normalized)}`);
  }

  async function openDocument(document: VehicleDocument) {
    if (document.external_url) {
      window.open(document.external_url, '_blank', 'noopener,noreferrer');
      return;
    }

    setOpeningDocument(document.document_id);
    try {
      const response = await fetch(`/api/vehicle-documents/${encodeURIComponent(document.document_id)}`);
      const body = await response.json() as { data?: { url: string }; error?: string };
      if (!response.ok || !body.data?.url) throw new Error(body.error || 'Kunde inte öppna dokumentet');
      window.open(body.data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte öppna dokumentet');
    } finally {
      setOpeningDocument(null);
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f2f4f5', padding: '1.5rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.08em', color: '#666' }}>Bilens digitala pärm</div>
            <h1 style={{ margin: '.2rem 0 0' }}>Vagnkort</h1>
          </div>
          <Link href="/" style={{ color: '#111' }}>Till startsidan</Link>
        </header>

        <form onSubmit={submit} style={{ ...card, display: 'flex', gap: '.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input value={input} onChange={(event) => setInput(event.target.value.toUpperCase())} placeholder="REG.NR" autoComplete="off" style={{ flex: '1 1 220px', padding: '.8rem', borderRadius: 8, border: '1px solid #bbb', fontSize: 16, textTransform: 'uppercase' }} />
          <button type="submit" style={{ padding: '.8rem 1.25rem', border: 0, borderRadius: 8, background: '#111', color: '#fff', fontWeight: 700 }}>Öppna Vagnkort</button>
        </form>

        {loading && <div style={card}>Hämtar bilens resa…</div>}
        {error && <div style={{ ...card, color: '#a00', marginBottom: '1rem' }}>{error}</div>}
        {!loading && data && !data.found && <div style={card}>Ingen fordonsdata hittades för {data.regnr}.</div>}

        {!loading && data?.found && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <section style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '1rem', flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 30, fontWeight: 800 }}>{data.regnr}</div><div style={{ color: '#555' }}>{[data.identity.brand, data.identity.model].filter(Boolean).join(' ') || 'Modell saknas'}</div></div>
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
                <JourneyPeriodControls regnr={data.regnr} openPeriods={data.journey.openPeriods} onChanged={() => setRefreshNonce((value) => value + 1)} />
                <JourneyMetricsPanel regnr={data.regnr} refreshNonce={refreshNonce} />
                <div style={{ marginTop: '1rem' }}>
                  {Object.keys(data.journey.totalHoursByType).length === 0 ? <p>Inga avslutade perioder ännu.</p> : Object.entries(data.journey.totalHoursByType).map(([type, total]) => <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '.45rem 0', borderBottom: '1px solid #eee' }}><span>{type}</span><strong>{hours(total)}</strong></div>)}
                </div>
              </section>
              <section style={card}>
                <h2 style={{ marginTop: 0 }}>SALU – slutdelen av bilens resa</h2>
                <SaluJourneyPanel
                  state={data.salu.state}
                  latestFlag={data.salu.latestFlag}
                  checkpoints={data.salu.checkpoints}
                  childProcesses={data.salu.childProcesses}
                  documents={data.documents}
                />
              </section>
            </div>

            <section style={card}>
              <h2 style={{ marginTop: 0 }}>Utrustning – Nybil mot nu</h2>
              {!equipmentDiffs.length ? <p>Jämförelseunderlag saknas.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={{ textAlign: 'left', padding: '.5rem' }}>Attribut</th><th style={{ textAlign: 'left', padding: '.5rem' }}>Nybil</th><th style={{ textAlign: 'left', padding: '.5rem' }}>Nu</th><th style={{ textAlign: 'left', padding: '.5rem' }}>Status</th></tr></thead><tbody>{equipmentDiffs.map((row) => <tr key={String(row.key)} style={{ background: row.changed ? '#fff2db' : undefined }}><td style={{ padding: '.55rem', borderTop: '1px solid #eee' }}>{row.label}</td><td style={{ padding: '.55rem', borderTop: '1px solid #eee' }}>{present(row.baseline)}</td><td style={{ padding: '.55rem', borderTop: '1px solid #eee' }}>{present(row.current)}</td><td style={{ padding: '.55rem', borderTop: '1px solid #eee', fontWeight: row.changed ? 700 : 400 }}>{row.changed ? 'Förändrat' : 'Oförändrat'}</td></tr>)}</tbody></table></div>}

              <EquipmentChangeControls regnr={data.regnr} current={data.equipment.current} onChanged={() => setRefreshNonce((value) => value + 1)} />

              {data.equipment.changes.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontWeight: 700, marginBottom: '.35rem' }}>Senaste dokumenterade förändringar</div>
                  {data.equipment.changes.slice(0, 8).map((change) => (
                    <div key={change.eventId} style={{ padding: '.5rem 0', borderTop: '1px solid #eee' }}>
                      <strong>{equipmentLabel(change.field)} → {present(change.value)}</strong>
                      <div style={{ fontSize: 13, color: '#666' }}>{formatDate(change.occurredAt)}{change.actorName || change.actorEmail ? ` · ${change.actorName || change.actorEmail}` : ''}</div>
                      {change.comment && <div>{change.comment}</div>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div style={grid}>
              <section style={card}>
                <h2 style={{ marginTop: 0 }}>Skador</h2>
                {data.damages.length === 0 ? <p>Inga registrerade skador.</p> : data.damages.slice(0, 10).map((damage) => <div key={damage.id} style={{ padding: '.55rem 0', borderBottom: '1px solid #eee' }}><strong>{damage.damage_type_raw || damage.legacy_damage_source_text || 'Skada'}</strong><div style={{ color: '#666', fontSize: 13 }}>{damage.source} · {formatDate(damage.damage_date)}</div></div>)}
              </section>
              <section style={card}>
                <h2 style={{ marginTop: 0 }}>Dokument</h2>
                <DocumentUpload
                  regnr={data.regnr}
                  damages={data.damages}
                  checkpoints={data.salu.checkpoints}
                  childProcesses={data.salu.childProcesses}
                  onUploaded={() => setRefreshNonce((value) => value + 1)}
                />
                <div style={{ marginTop: '1rem', display: 'grid', gap: '.65rem' }}>
                  {data.documents.length === 0 ? <p>Inga dokument registrerade ännu.</p> : data.documents.slice(0, 20).map((document) => {
                    const sourceFacts = document.metadata?.sourceFacts;
                    const fingerprint = document.metadata?.contentFingerprint;
                    const duplicateCount = fingerprint ? fingerprintCounts.get(fingerprint) ?? 0 : 0;
                    return (
                      <div key={document.document_id} style={{ padding: '.8rem', border: '1px solid #e3e3e3', borderRadius: 10, background: duplicateCount > 1 ? '#fff7ed' : '#fff', display: 'grid', gap: '.6rem' }}>
                        <div style={{ display: 'flex', gap: '.7rem', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              <strong style={{ overflowWrap: 'anywhere' }}>{document.title || document.file_name}</strong>
                              {duplicateCount > 1 && <span style={{ background: '#fed7aa', color: '#9a3412', borderRadius: 999, padding: '.15rem .45rem', fontSize: 11, fontWeight: 700 }}>EXAKT FIL-DUBBLETT · {duplicateCount} st</span>}
                            </div>
                            <div style={{ color: '#666', fontSize: 13, marginTop: '.15rem' }}>{document.document_type} · {formatDate(document.uploaded_at)} · {formatFileSize(document.size_bytes)}</div>
                            <div style={{ color: '#777', fontSize: 12, marginTop: '.15rem' }}>{document.source_system || (document.sourceKind === 'legacy_receipt' ? 'LEGACY_RECEIPTS' : 'INCHECKAD')}</div>
                          </div>
                          <button type="button" onClick={() => void openDocument(document)} disabled={openingDocument === document.document_id} style={{ border: '1px solid #bbb', borderRadius: 7, background: '#fff', padding: '.45rem .7rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            {openingDocument === document.document_id ? 'Öppnar…' : 'Visa dokument'}
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', background: '#f0f0f0', borderRadius: 999, padding: '.18rem .5rem', fontSize: 12 }}>
                            Kopplat till: {documentContextLabel(document)}
                          </span>
                          {fingerprint && <span style={{ display: 'inline-flex', alignItems: 'center', background: '#eef6ff', borderRadius: 999, padding: '.18rem .5rem', fontSize: 12 }}>Filfingeravtryck finns</span>}
                        </div>

                        {sourceFacts && (
                          <div style={{ borderTop: '1px solid #eee', paddingTop: '.6rem' }}>
                            <div style={{ fontSize: 12, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.35rem' }}>Källfakta från dokument</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.45rem' }}>
                              <div><span style={{ display: 'block', fontSize: 11, color: '#777' }}>Leverantör</span><strong>{sourceFacts.supplier || '—'}</strong></div>
                              <div><span style={{ display: 'block', fontSize: 11, color: '#777' }}>Faktura-/kvittonr</span><strong>{sourceFacts.invoiceNumber || '—'}</strong></div>
                              <div><span style={{ display: 'block', fontSize: 11, color: '#777' }}>Dokumentdatum</span><strong>{formatDocumentDate(sourceFacts.documentDate)}</strong></div>
                              <div><span style={{ display: 'block', fontSize: 11, color: '#777' }}>Dokumentbelopp</span><strong>{formatMoney(sourceFacts.totalAmount, sourceFacts.currency || 'SEK')}</strong></div>
                            </div>
                            <div style={{ marginTop: '.35rem', fontSize: 11, color: '#777' }}>Källregistrerat belopp · ingen bedömning av kostnadsansvar eller ekonomiskt utfall.</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <section style={card}>
              <h2 style={{ marginTop: 0 }}>Tidslinje</h2>
              {data.journey.events.length === 0 && data.journey.periods.length === 0 ? <p>Fordonsresan har ännu inga nya händelser eller perioder.</p> : <>
                {data.journey.events.slice(0, 15).map((event) => <div key={event.event_id} style={{ padding: '.6rem 0', borderBottom: '1px solid #eee' }}><strong>{event.event_type}</strong><div style={{ color: '#666', fontSize: 13 }}>{formatDate(event.occurred_at)} · {event.source_system}{event.actor_name ? ` · ${event.actor_name}` : ''}</div></div>)}
                {data.journey.periods.slice(0, 15).map((period) => <div key={period.period_id} style={{ padding: '.6rem 0', borderBottom: '1px solid #eee' }}><strong>{period.period_type}</strong> {period.ended_at === null && <span style={{ color: '#a00' }}>· pågår</span>}<div style={{ color: '#666', fontSize: 13 }}>{formatDate(period.started_at)} → {formatDate(period.ended_at)}{period.durationHours !== null ? ` · ${hours(period.durationHours)}` : ''}</div>{(period.reason_text || period.reason_code) && <div>{period.reason_text || period.reason_code}</div>}</div>)}
              </>}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
