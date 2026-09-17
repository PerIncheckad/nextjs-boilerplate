'use client';

import { FormEvent, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';

type Contributor = {
  classification: string;
  observationIdentity: string;
  sourceRecordId: string;
  sourceBusinessTimestamp?: string | null;
};

type SliceResponse = {
  contract: 'INSIGHT_CHECKIN_SLICE_V1';
  selectedPeriod: { local: { startDate: string; endDateExclusive: string; localDayCount: number } };
  comparisonPeriod: { local: { startDate: string; endDateExclusive: string; localDayCount: number } };
  selectedEvaluation: {
    result: {
      metricId: string;
      metricVersion: number;
      definitionFingerprint: string;
      engineBuildSha: string;
      value: number;
      quality: { maturity: string };
      evaluation: { evaluationId: string; calculatedAt: string; contributors: Contributor[] };
    };
    signature: string;
  };
  comparisonEvaluation: unknown;
  comparison: { absoluteDifference: number | null; relativeChangePct: number | null; maturity: string; reasons: string[] };
};

export default function InsightFlowPage() {
  const [startDate, setStartDate] = useState('');
  const [endDateExclusive, setEndDateExclusive] = useState('');
  const [data, setData] = useState<SliceResponse | null>(null);
  const [error, setError] = useState('');
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setTrace(null);
    try {
      const response = await authenticatedApiFetch('/api/insight/checkin-completed-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDateExclusive }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'INSIGHT kunde inte läsa perioden.');
      setData(payload.data);
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : 'INSIGHT kunde inte läsa perioden.');
    } finally {
      setLoading(false);
    }
  }

  async function openContributor(contributorId: string) {
    if (!data) return;
    setError('');
    setTrace(null);
    const response = await authenticatedApiFetch('/api/insight/checkin-completed-count/traceback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evaluation: data.selectedEvaluation, contributorId }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload?.error ?? 'Traceback nekades.');
      return;
    }
    setTrace(payload.data);
  }

  const result = data?.selectedEvaluation.result;

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px 80px', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ letterSpacing: '0.12em', fontSize: 12 }}>INCHECKAD / INSIGHT</p>
      <h1>Flöde &amp; cykler</h1>
      <h2>Slutförda Check-ins</h2>

      <form onSubmit={submit} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', margin: '28px 0' }}>
        <label>Startdatum<br /><input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>Slutdatum exklusive<br /><input required type="date" value={endDateExclusive} onChange={(e) => setEndDateExclusive(e.target.value)} /></label>
        <button type="submit" disabled={loading}>{loading ? 'Läser…' : 'Analysera'}</button>
      </form>

      {error && <p role="alert">{error}</p>}

      {data && result && (
        <>
          <section aria-label="Resultat" style={{ borderTop: '1px solid currentColor', paddingTop: 24 }}>
            <p>{data.selectedPeriod.local.startDate} → {data.selectedPeriod.local.endDateExclusive} · {data.selectedPeriod.local.localDayCount} lokala kalenderdygn</p>
            <p style={{ fontSize: 56, margin: '12px 0' }}>{result.value}</p>
            <p><strong>{result.quality.maturity === 'VERIFIED' ? 'VERIFIERAD' : result.quality.maturity}</strong> · n = {result.evaluation.contributors.length}</p>
            <p>Jämförelseperiod: {data.comparisonPeriod.local.startDate} → {data.comparisonPeriod.local.endDateExclusive}</p>
            <p>Absolut förändring: {data.comparison.absoluteDifference ?? '—'}</p>
            <p>Relativ förändring: {data.comparison.relativeChangePct == null ? 'Ej beräkningsbar' : `${data.comparison.relativeChangePct.toFixed(1)} %`}</p>
          </section>

          <section style={{ marginTop: 36 }}>
            <h3>Contributors</h3>
            <p>Exakt evaluation-bundet contributor-set.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th align="left">Completed at</th><th align="left">Source record</th><th /></tr></thead>
                <tbody>
                  {result.evaluation.contributors.map((item) => (
                    <tr key={item.observationIdentity}>
                      <td>{item.sourceBusinessTimestamp ?? '—'}</td>
                      <td><code>{item.sourceRecordId}</code></td>
                      <td><button type="button" onClick={() => openContributor(item.observationIdentity)}>Källa</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginTop: 36 }}>
            <h3>Om måttet</h3>
            <p><code>{result.metricId}@{result.metricVersion}</code></p>
            <p>Definition fingerprint: <code>{result.definitionFingerprint}</code></p>
            <p>Engine build: <code>{result.engineBuildSha}</code></p>
            <p>Time basis: completed_at / Europe/Stockholm / [start,end)</p>
            <p>Calculated at: {result.evaluation.calculatedAt}</p>
          </section>
        </>
      )}

      {trace && (
        <section style={{ marginTop: 36, borderTop: '1px solid currentColor', paddingTop: 24 }}>
          <h3>Exact source traceback</h3>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(trace, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
