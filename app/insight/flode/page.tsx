'use client';

import { useMemo, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';
import type {
  CheckinTracebackResultV1,
  ComparisonResult,
  SignedMetricEvaluationV1,
} from '@/lib/analytics';

type LocalPeriod = {
  startDate: string;
  endDateExclusive: string;
  localCalendarDays: number;
};

type CanonicalPeriod = {
  start: string;
  end: string;
  timezone: 'Europe/Stockholm';
  intervalSemantics: '[start,end)';
};

type SliceResponse = {
  contract: 'INSIGHT_CHECKIN_SLICE_V1';
  selectedLocalPeriod: LocalPeriod;
  selectedCanonicalPeriod: CanonicalPeriod;
  comparisonLocalPeriod: LocalPeriod;
  comparisonCanonicalPeriod: CanonicalPeriod;
  selectedEvaluation: SignedMetricEvaluationV1;
  comparisonEvaluation: SignedMetricEvaluationV1;
  comparison: ComparisonResult;
};

function stockholmTodayInput(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shiftInput(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function formatNumber(value: number | null): string {
  return value == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(value);
}

export default function InsightFlowPage() {
  const today = useMemo(() => stockholmTodayInput(), []);
  const [startDate, setStartDate] = useState(() => shiftInput(today, -7));
  const [endDateExclusive, setEndDateExclusive] = useState(today);
  const [data, setData] = useState<SliceResponse | null>(null);
  const [traceback, setTraceback] = useState<CheckinTracebackResultV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadSlice(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setTraceback(null);
    try {
      const response = await authenticatedApiFetch('/api/insight/checkin-completed-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDateExclusive }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa INSIGHT-resultatet.');
      setData(payload.data as SliceResponse);
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : 'Kunde inte läsa INSIGHT-resultatet.');
    } finally {
      setLoading(false);
    }
  }

  async function openContributor(contributorId: string) {
    if (!data) return;
    setError('');
    try {
      const response = await authenticatedApiFetch('/api/insight/checkin-completed-count/traceback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluation: data.selectedEvaluation, contributorId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Traceback nekades.');
      setTraceback(payload.data as CheckinTracebackResultV1);
    } catch (caught) {
      setTraceback(null);
      setError(caught instanceof Error ? caught.message : 'Traceback nekades.');
    }
  }

  const result = data?.selectedEvaluation.result;
  const comparisonResult = data?.comparisonEvaluation.result;

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px 64px', fontFamily: 'system-ui, sans-serif', color: '#171717' }}>
      <header style={{ borderBottom: '1px solid #d8d6d0', paddingBottom: 20, marginBottom: 28 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.14em' }}>INCHECKAD / INSIGHT</div>
        <h1 style={{ margin: '8px 0 4px', fontSize: 34 }}>Flöde & cykler</h1>
        <p style={{ margin: 0, color: '#5d5d5d' }}>Slutförda Check-ins · CHECKIN_COMPLETED_COUNT@1 · TOTAL</p>
      </header>

      <form onSubmit={loadSlice} style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap', marginBottom: 28 }}>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          Startdatum
          <input type="date" value={startDate} max={today} onChange={(event) => setStartDate(event.target.value)} required />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          Slutdatum, exklusive
          <input type="date" value={endDateExclusive} max={today} onChange={(event) => setEndDateExclusive(event.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Läser…' : 'Visa verifierat resultat'}</button>
      </form>

      {error && <p role="alert" style={{ padding: 12, border: '1px solid #b5b1a8' }}>{error}</p>}

      {data && result && comparisonResult && (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 28 }}>
            <article style={{ border: '1px solid #d8d6d0', padding: 18 }}>
              <div style={{ fontSize: 12, letterSpacing: '0.1em' }}>VALD PERIOD</div>
              <strong style={{ display: 'block', fontSize: 40, marginTop: 8 }}>{formatNumber(result.value)}</strong>
              <span>VERIFIERAD · n = {result.statistics.n}</span>
            </article>
            <article style={{ border: '1px solid #d8d6d0', padding: 18 }}>
              <div style={{ fontSize: 12, letterSpacing: '0.1em' }}>FÖREGÅENDE PERIOD</div>
              <strong style={{ display: 'block', fontSize: 40, marginTop: 8 }}>{formatNumber(comparisonResult.value)}</strong>
              <span>VERIFIERAD · n = {comparisonResult.statistics.n}</span>
            </article>
            <article style={{ border: '1px solid #d8d6d0', padding: 18 }}>
              <div style={{ fontSize: 12, letterSpacing: '0.1em' }}>FÖRÄNDRING</div>
              <strong style={{ display: 'block', fontSize: 28, marginTop: 12 }}>{formatNumber(data.comparison.absoluteDifference)}</strong>
              <span>{data.comparison.relativeChangePct == null ? 'Relativ förändring ej beräkningsbar' : `${formatNumber(data.comparison.relativeChangePct)} %`}</span>
            </article>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 20 }}>Periodkontrakt</h2>
            <p>{data.selectedLocalPeriod.startDate} → {data.selectedLocalPeriod.endDateExclusive} · {data.selectedLocalPeriod.localCalendarDays} lokala kalenderdygn</p>
            <p>Jämförelse: {data.comparisonLocalPeriod.startDate} → {data.comparisonLocalPeriod.endDateExclusive}</p>
            <p style={{ color: '#5d5d5d' }}>Europe/Stockholm · [start,end) · completed_at · beräknad {new Date(result.evaluation.calculatedAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}</p>
          </section>

          <section>
            <h2 style={{ fontSize: 20 }}>Contributors · {result.evaluation.contributors.length}</h2>
            <div style={{ display: 'grid', gap: 6 }}>
              {result.evaluation.contributors.map((contributor) => (
                <button
                  key={contributor.observationIdentity}
                  type="button"
                  onClick={() => openContributor(contributor.observationIdentity)}
                  style={{ textAlign: 'left', padding: 10, border: '1px solid #dedbd4', background: 'transparent' }}
                >
                  {contributor.sourceBusinessTimestamp ?? 'Tid saknas'} · {contributor.sourceRecordId}
                </button>
              ))}
            </div>
          </section>

          {traceback && (
            <section style={{ marginTop: 28, borderTop: '1px solid #d8d6d0', paddingTop: 20 }}>
              <div style={{ fontSize: 12, letterSpacing: '0.1em' }}>EXACT SOURCE TRACEBACK</div>
              <h2 style={{ fontSize: 20 }}>Check-in {traceback.source.id}</h2>
              <p>Status: {traceback.source.status}</p>
              <p>completed_at: {traceback.source.completed_at}</p>
              <p>Evaluation: {traceback.evaluationId}</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
