'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type FuelEvidenceRow = {
  checkinId: string;
  regnr: string;
  completedAt: string;
  station: string | null;
  liters: number | null;
  pricePerLiter: number | null;
  currency: string;
  calculatedTotal: number | null;
  hasReceipt: boolean;
  receipt: { url: string; uploadedAt: string | null } | null;
  vagnkort: string;
};

type FuelEvidenceData = {
  generatedAt: string;
  hours: number;
  since: string;
  summary: {
    tankedCheckins: number;
    withReceipt: number;
    withoutReceipt: number;
    coveragePercent: number | null;
  };
  interpretation: {
    receiptIsOptional: boolean;
    monetaryInterpretation: boolean;
    message: string;
  };
  rows: FuelEvidenceRow[];
};

const WINDOWS = [
  { hours: 24, label: '24 timmar' },
  { hours: 72, label: '72 timmar' },
  { hours: 168, label: '7 dagar' },
] as const;

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  padding: '1rem 1.1rem',
  boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('sv-SE');
}

function money(value: number | null, currency: string) {
  if (value == null) return '—';
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} ${currency}`;
}

async function fetchEvidence(hours: number): Promise<FuelEvidenceData> {
  const response = await fetch(`/api/operator-fuel-evidence?hours=${hours}`, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa tankningsevidens');
  return payload.data as FuelEvidenceData;
}

export default function FuelEvidenceClient() {
  const [hours, setHours] = useState(168);
  const [data, setData] = useState<FuelEvidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (windowHours: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchEvidence(windowHours));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa tankningsevidens');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchEvidence(168)
      .then((next) => {
        if (!active) return;
        setData(next);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa tankningsevidens');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: '#f2f4f5', padding: '1.5rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.08em', color: '#666' }}>INCHECKAD / DRIFT & EVIDENS</div>
            <h1 style={{ margin: '.2rem 0' }}>Tankningsevidens</h1>
            <p style={{ margin: 0 }}>Hur stor del av registrerade tankningar har dokumenterat tankkvitto?</p>
          </div>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <Link href="/tower" style={{ color: '#111' }}>Tower</Link>
            <Link href="/tower/metrics" style={{ color: '#111' }}>Driftmätning</Link>
          </div>
        </header>

        <section style={{ ...card, background: '#fffbe8' }}>
          Read-only uppföljning. Kvitto är fortfarande frivilligt och denna vy gör ingen bedömning av kostnadsansvar, ersättning eller monetärt utfall.
        </section>

        {error ? <section style={{ ...card, color: '#a00' }}>{error}</section> : null}

        <section style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <label>
            <span style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: '.3rem' }}>Tidsfönster</span>
            <select value={hours} onChange={(event) => {
              const next = Number(event.target.value);
              setHours(next);
              void load(next);
            }} style={{ padding: '.6rem', borderRadius: 8 }}>
              {WINDOWS.map((window) => <option key={window.hours} value={window.hours}>{window.label}</option>)}
            </select>
          </label>
          <div style={{ fontSize: 13, color: '#666' }}>Senast läst: <strong style={{ color: '#111' }}>{formatDate(data?.generatedAt ?? null)}</strong></div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <Metric title="Tankad nu" value={data?.summary.tankedCheckins ?? 0} />
          <Metric title="Med kvitto" value={data?.summary.withReceipt ?? 0} />
          <Metric title="Utan kvitto" value={data?.summary.withoutReceipt ?? 0} />
          <Metric title="Kvittotäckning" value={data?.summary.coveragePercent == null ? '—' : `${data.summary.coveragePercent}%`} />
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Registrerade tankningar</h2>
          {loading && !data ? <p>Läser tankningsevidens…</p> : null}
          {!loading && data?.rows.length === 0 ? <p>Inga registrerade tankningar i valt tidsfönster.</p> : null}
          {(data?.rows.length ?? 0) > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '.55rem' }}>Tid</th>
                    <th style={{ textAlign: 'left', padding: '.55rem' }}>Fordon</th>
                    <th style={{ textAlign: 'left', padding: '.55rem' }}>Station</th>
                    <th style={{ textAlign: 'left', padding: '.55rem' }}>Tankning</th>
                    <th style={{ textAlign: 'left', padding: '.55rem' }}>Kvitto</th>
                    <th style={{ textAlign: 'left', padding: '.55rem' }}>Vagnkort</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.rows.map((row) => (
                    <tr key={row.checkinId}>
                      <td style={{ padding: '.6rem', borderTop: '1px solid #eee' }}>{formatDate(row.completedAt)}</td>
                      <td style={{ padding: '.6rem', borderTop: '1px solid #eee', fontWeight: 700 }}>{row.regnr}</td>
                      <td style={{ padding: '.6rem', borderTop: '1px solid #eee' }}>{row.station ?? '—'}</td>
                      <td style={{ padding: '.6rem', borderTop: '1px solid #eee' }}>
                        {row.liters ?? '—'} L · {row.pricePerLiter ?? '—'} /L
                        <div style={{ fontSize: 12, color: '#666' }}>Beräknat: {money(row.calculatedTotal, row.currency)}</div>
                      </td>
                      <td style={{ padding: '.6rem', borderTop: '1px solid #eee' }}>
                        {row.receipt ? <a href={row.receipt.url} target="_blank" rel="noreferrer">Visa kvitto →</a> : <strong style={{ color: '#a00' }}>Saknas</strong>}
                      </td>
                      <td style={{ padding: '.6rem', borderTop: '1px solid #eee' }}><Link href={row.vagnkort}>Öppna →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Tolkning</h2>
          <p style={{ marginBottom: 0 }}>{data?.interpretation.message ?? 'Kvittotäckning beskriver endast dokumenterad evidens.'}</p>
        </section>
      </div>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: number | string }) {
  return (
    <div style={card}>
      <span style={{ display: 'block', color: '#666', fontSize: 13 }}>{title}</span>
      <strong style={{ fontSize: 30 }}>{value}</strong>
    </div>
  );
}
