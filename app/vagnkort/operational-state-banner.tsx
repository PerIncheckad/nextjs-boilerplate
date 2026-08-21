'use client';

import { useEffect, useState } from 'react';

type OperationalState = {
  knowledgeState: 'VERIFIED' | 'UNKNOWN';
  currentVerifiedState: string | null;
  stateStartedAt: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  establishedBySource: string | null;
  establishedByEntity: string | null;
  establishedByRecord: string | null;
  lastConfirmedAt: string | null;
  confirmationCount: number;
  latestConfirmationSource: string | null;
  sale: {
    state: 'SOLD' | 'NOT_SOLD' | 'UNKNOWN';
    occurredAt: string | null;
    sourceSystem: string | null;
    sourceEntity: string | null;
    sourceRecordId: string | null;
  };
};

type ApiResponse = { data?: OperationalState; error?: string };

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('sv-SE');
}

function sourceLabel(source: string | null, entity: string | null) {
  if (!source && !entity) return '—';
  return [source, entity].filter(Boolean).join(' / ');
}

export default function OperationalStateBanner() {
  const [state, setState] = useState<OperationalState | null>(null);
  const [regnr, setRegnr] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const normalized = (new URLSearchParams(window.location.search).get('reg') ?? '')
      .toUpperCase()
      .replace(/\s+/g, '');
    setRegnr(normalized);
    if (!normalized) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/vehicle-journey/operational-state?reg=${encodeURIComponent(normalized)}`);
        const body = (await response.json()) as ApiResponse;
        if (!response.ok) throw new Error(body.error || 'Kunde inte läsa verifierat fordonsläge');
        if (!cancelled) setState(body.data ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Kunde inte läsa verifierat fordonsläge');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!regnr) return null;

  const shell: React.CSSProperties = {
    maxWidth: 1200,
    margin: '0 auto 1rem',
    background: '#fff',
    borderRadius: 14,
    padding: '1rem 1.1rem',
    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
  };

  if (error) {
    return <section style={{ ...shell, border: '1px solid #d9d9d9' }}><strong>Verifierat fordonsläge kunde inte läsas.</strong><div style={{ marginTop: '.35rem', color: '#666' }}>{error}</div></section>;
  }

  if (!state) {
    return <section style={shell}>Läser verifierat fordonsläge…</section>;
  }

  if (state.knowledgeState === 'UNKNOWN') {
    return (
      <section style={{ ...shell, border: '2px solid #777' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>OPERATIVT HUVUDTILLSTÅND</div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: '.3rem' }}>UNKNOWN</div>
        <div style={{ marginTop: '.35rem', color: '#555' }}>Ingen verifierad statusförändring finns. Incheckad gissar inte AVAILABLE, RENTAL eller något annat tillstånd.</div>
        {state.sale.state !== 'UNKNOWN' && <div style={{ marginTop: '.7rem', fontWeight: 700 }}>SÅLD-faktum: {state.sale.state === 'SOLD' ? 'SÅLD' : 'KORRIGERAT / INTE SÅLD'} · {formatDate(state.sale.occurredAt)}</div>}
      </section>
    );
  }

  return (
    <section style={{ ...shell, border: '2px solid #222' }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>VERIFIERAT OPERATIVT HUVUDTILLSTÅND</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginTop: '.35rem' }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{state.currentVerifiedState}</div>
          <div style={{ marginTop: '.2rem' }}>Sedan {formatDate(state.stateStartedAt)}</div>
          {state.reasonText && <div style={{ marginTop: '.2rem' }}>Orsak: <strong>{state.reasonText}</strong>{state.reasonCode ? ` · ${state.reasonCode}` : ''}</div>}
        </div>
        <div style={{ minWidth: 260, fontSize: 14 }}>
          <div>Fastställt genom: <strong>{sourceLabel(state.establishedBySource, state.establishedByEntity)}</strong></div>
          <div style={{ marginTop: '.25rem' }}>Källpost: {state.establishedByRecord || '—'}</div>
          <div style={{ marginTop: '.25rem' }}>Bekräftelser: <strong>{state.confirmationCount}</strong></div>
          {state.lastConfirmedAt && <div style={{ marginTop: '.25rem' }}>Senast bekräftat: {formatDate(state.lastConfirmedAt)}{state.latestConfirmationSource ? ` · ${state.latestConfirmationSource}` : ''}</div>}
        </div>
      </div>
      {state.sale.state !== 'UNKNOWN' && <div style={{ marginTop: '.8rem', paddingTop: '.65rem', borderTop: '1px solid #ddd', fontWeight: 700 }}>Separat terminalt SÅLD-faktum: {state.sale.state === 'SOLD' ? 'SÅLD' : 'KORRIGERAT / INTE SÅLD'} · {formatDate(state.sale.occurredAt)}</div>}
    </section>
  );
}
