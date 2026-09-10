'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MetricResultV1 } from '@/lib/analytics/contracts';
import {
  isCompletedCheckinReportPeriod,
  latestCompletedDayInput,
  latestCompletedMonthInput,
  resolveCheckinReportPeriod,
  type CheckinReportPeriodType,
} from '@/lib/reporting/checkin-report-period';

type ReportResponse<T> = { data?: T; error?: string; code?: string };
type SignedMetricEvaluationV1 = { contract: 'SIGNED_METRIC_EVALUATION_V1'; result: MetricResultV1 };

const hoursFormatter = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 3 });

function formatHours(value: number | null): string {
  return value == null ? '—' : `${hoursFormatter.format(value)} h`;
}

function formatPeriodLabel(start: string, type: CheckinReportPeriodType): string {
  const startDate = new Date(start);
  if (type === 'month') {
    return startDate.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' });
  }
  return startDate.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

async function readLayer1Metric(period: { start: string; end: string }): Promise<MetricResultV1> {
  const response = await fetch('/api/analytics/layer1-period-duration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metricId: 'LAYER1_PERIOD_DURATION_HOURS',
      metricVersion: 1,
      period: { start: period.start, end: period.end },
    }),
  });

  const body = await response.json() as ReportResponse<SignedMetricEvaluationV1>;
  if (!response.ok || !body.data) throw new Error(body.error || body.code || `HTTP ${response.status}`);

  const evaluation = body.data;
  const result = evaluation.result;
  if (evaluation.contract !== 'SIGNED_METRIC_EVALUATION_V1') throw new Error('Ogiltigt evaluation-kontrakt');
  if (result.resultContract !== 'METRIC_RESULT_V1') throw new Error('Ogiltigt metric-resultat');
  if (result.metricId !== 'LAYER1_PERIOD_DURATION_HOURS' || result.metricVersion !== 1) throw new Error('Fel metric/version');
  if (result.unit !== 'HOURS') throw new Error('Fel metric-enhet');
  if (result.scope.timezone !== 'Europe/Stockholm' || result.scope.intervalSemantics !== '[start,end)') throw new Error('Fel periodkontrakt');
  if (result.scope.dimensions.length !== 0) throw new Error('Layer 1 report v1 får endast använda TOTAL');
  if (result.value !== result.statistics.mean) throw new Error('Layer 1 value/mean-invariant bruten');

  return result;
}

export default function Layer1PeriodDurationReport() {
  const [periodType, setPeriodType] = useState<CheckinReportPeriodType>('day');
  const [periodValue, setPeriodValue] = useState(() => latestCompletedDayInput());
  const [result, setResult] = useState<MetricResultV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const resolvedPeriod = useMemo(() => {
    try {
      return resolveCheckinReportPeriod(periodType, periodValue);
    } catch {
      return null;
    }
  }, [periodType, periodValue]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!resolvedPeriod) {
        setResult(null);
        setLoading(false);
        setError('Ogiltig period.');
        return;
      }
      if (!isCompletedCheckinReportPeriod(resolvedPeriod)) {
        setResult(null);
        setLoading(false);
        setError('Endast avslutade perioder kan visas som slutligt rapportutfall.');
        return;
      }

      setLoading(true);
      setError('');
      try {
        const next = await readLayer1Metric(resolvedPeriod);
        if (!cancelled) setResult(next);
      } catch (loadError: unknown) {
        if (!cancelled) {
          setResult(null);
          setError(loadError instanceof Error ? loadError.message : 'Kunde inte hämta Layer 1-periodlängd.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [resolvedPeriod]);

  const handlePeriodType = (nextType: CheckinReportPeriodType) => {
    setPeriodType(nextType);
    setPeriodValue(nextType === 'day' ? latestCompletedDayInput() : latestCompletedMonthInput());
  };

  return (
    <section aria-labelledby="layer1-period-duration-title" style={{ border: '1px solid #dedbd3', borderRadius: 12, padding: '18px 20px', marginBottom: 24, background: '#faf9f6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6 }}>Officiell plattformsrapport</div>
          <h2 id="layer1-period-duration-title" style={{ margin: '4px 0 2px', fontSize: 20 }}>LAYER 1 – PERIODLÄNGD</h2>
          <div style={{ fontSize: 13, opacity: 0.7 }}>TOTAL · completion cohort via ended_at · Europe/Stockholm</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Periodtyp
            <select value={periodType} onChange={(event) => handlePeriodType(event.target.value as CheckinReportPeriodType)}>
              <option value="day">DAG</option>
              <option value="month">MÅNAD</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Period
            <input
              type={periodType === 'day' ? 'date' : 'month'}
              value={periodValue}
              max={periodType === 'day' ? latestCompletedDayInput() : latestCompletedMonthInput()}
              onChange={(event) => setPeriodValue(event.target.value)}
            />
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) repeat(3, minmax(120px, 0.7fr))', gap: 16, marginTop: 18 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>Genomsnittlig periodlängd</div>
          <div style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 650, marginTop: 3 }}>{loading ? '…' : formatHours(result?.value ?? null)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>Median</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 5 }}>{formatHours(result?.statistics.median ?? null)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>P90</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 5 }}>{formatHours(result?.statistics.p90 ?? null)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>Antal avslutade perioder</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 5 }}>{result?.statistics.n ?? '—'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(240px, 2fr)', gap: 16, marginTop: 16, fontSize: 12, lineHeight: 1.55 }}>
        <div>
          Status: <strong>{result?.quality.maturity ?? (loading ? 'HÄMTAR' : 'EJ TILLGÄNGLIG')}</strong><br />
          Coverage: <strong>{result?.quality.coverage == null ? 'saknar känd denominator' : result.quality.coverage}</strong>
        </div>
        <div style={{ opacity: 0.68 }}>
          {resolvedPeriod ? <div>Vald period: {formatPeriodLabel(resolvedPeriod.start, periodType)}</div> : null}
          {result ? (
            <>
              <div>Quality: {result.quality.reasons.join(', ') || '—'}</div>
              <div>Beräknad: {new Date(result.evaluation.calculatedAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' })}</div>
              <div>Verifiering: {result.engineBuildSha.slice(0, 12)} · {result.scope.intervalSemantics} · {result.scope.timezone}</div>
            </>
          ) : null}
          {error ? <div style={{ color: '#8b1e1e', opacity: 1 }}>{error}</div> : null}
        </div>
      </div>
    </section>
  );
}
