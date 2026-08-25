'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import styles from './metrics.module.css';

type CountItem = { label: string; count: number };

type MetricsData = {
  generatedAt: string;
  hours: number;
  since: string;
  sample: {
    periods: number;
    closedPeriods: number;
    downtimePeriods: number;
    handoffs: number;
    verifiedHandoffs: number;
    actions: number;
    verifiedActions: number;
    checkpoints: number;
  };
  operational: {
    openHandoffs: number;
    openActions: number;
    overdueActions: number;
    deviations: number;
    waitingCheckpoints: number;
  };
  leadTimes: {
    handoffAgeAvgHours: number | null;
    handoffAgeMedianHours: number | null;
    verifiedHandoffAvgHours: number | null;
    actionAgeAvgHours: number | null;
    actionAgeMedianHours: number | null;
    verifiedActionAvgHours: number | null;
    closedPeriodAvgHours: number | null;
    closedPeriodMedianHours: number | null;
    periodObservedAvgHours: number | null;
    downtimeObservedAvgHours: number | null;
  };
  breakdowns: {
    periodTypes: CountItem[];
    handoffStatuses: CountItem[];
    actionStatuses: CountItem[];
    checkpointStatuses: CountItem[];
  };
  interpretation: {
    minimumReliableSample: number;
    handoffLeadTimeReliable: boolean;
    actionLeadTimeReliable: boolean;
    downtimeLeadTimeReliable: boolean;
  };
};

const WINDOWS = [
  { hours: 24, label: '24 timmar' },
  { hours: 72, label: '72 timmar' },
  { hours: 168, label: '7 dagar' },
] as const;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatHours(value: number | null): string {
  if (value == null) return 'Ej mätbart ännu';
  if (value < 24) return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} h`;
  return `${(value / 24).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} d`;
}

async function fetchMetrics(hours: number): Promise<MetricsData> {
  const response = await fetch(`/api/operator-metrics?hours=${hours}`, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa driftmätning');
  return payload.data as MetricsData;
}

export default function OperatorMetrics() {
  const [hours, setHours] = useState(168);
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (windowHours: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMetrics(windowHours));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa driftmätning');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchMetrics(168)
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa driftmätning');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>INCHECKAD / DRIFT & EVIDENS</div>
          <h1>Driftmätning</h1>
          <p>Vad börjar den verifierade driften faktiskt visa?</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondaryButton} href="/tower">Tower</Link>
          <Link className={styles.secondaryButton} href="/tower/history">Drifthistorik</Link>
          <button className={styles.primaryButton} type="button" onClick={() => void load(hours)} disabled={loading}>
            {loading ? 'Uppdaterar…' : 'Uppdatera'}
          </button>
        </div>
      </header>

      <div className={styles.notice}>
        Read-only mätning från redan registrerad evidens. Små urval markeras som otillräckliga i stället för att tolkas som säkra slutsatser.
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.controls}>
        <label>
          <span>Tidsfönster</span>
          <select value={hours} onChange={(event) => {
            const next = Number(event.target.value);
            setHours(next);
            void load(next);
          }}>
            {WINDOWS.map((window) => <option key={window.hours} value={window.hours}>{window.label}</option>)}
          </select>
        </label>
        <div className={styles.generated}>
          <span>Senast läst</span>
          <strong>{data ? formatDate(data.generatedAt) : '—'}</strong>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Operativ mätning">
        <Metric title="Öppna handslag" value={data?.operational.openHandoffs ?? 0} />
        <Metric title="Öppna actions" value={data?.operational.openActions ?? 0} />
        <Metric title="Försenade actions" value={data?.operational.overdueActions ?? 0} emphasis />
        <Metric title="Avvikelser" value={data?.operational.deviations ?? 0} />
        <Metric title="Väntar kontroll" value={data?.operational.waitingCheckpoints ?? 0} />
      </section>

      <section className={styles.grid}>
        <MeasureCard
          title="Handslag"
          primary={formatHours(data?.leadTimes.handoffAgeAvgHours ?? null)}
          secondary={`Median ålder: ${formatHours(data?.leadTimes.handoffAgeMedianHours ?? null)}`}
          sample={`Urval ${data?.sample.handoffs ?? 0} · verifierade ${data?.sample.verifiedHandoffs ?? 0}`}
          reliable={data?.interpretation.handoffLeadTimeReliable ?? false}
        />
        <MeasureCard
          title="Actions"
          primary={formatHours(data?.leadTimes.actionAgeAvgHours ?? null)}
          secondary={`Median ålder: ${formatHours(data?.leadTimes.actionAgeMedianHours ?? null)}`}
          sample={`Urval ${data?.sample.actions ?? 0} · verifierade ${data?.sample.verifiedActions ?? 0}`}
          reliable={data?.interpretation.actionLeadTimeReliable ?? false}
        />
        <MeasureCard
          title="Downtime"
          primary={formatHours(data?.leadTimes.downtimeObservedAvgHours ?? null)}
          secondary="Observerad genomsnittlig varaktighet"
          sample={`Urval ${data?.sample.downtimePeriods ?? 0}`}
          reliable={data?.interpretation.downtimeLeadTimeReliable ?? false}
        />
        <MeasureCard
          title="Stängda perioder"
          primary={formatHours(data?.leadTimes.closedPeriodAvgHours ?? null)}
          secondary={`Median: ${formatHours(data?.leadTimes.closedPeriodMedianHours ?? null)}`}
          sample={`Stängda ${data?.sample.closedPeriods ?? 0} av ${data?.sample.periods ?? 0}`}
          reliable={(data?.sample.closedPeriods ?? 0) >= (data?.interpretation.minimumReliableSample ?? 10)}
        />
      </section>

      <section className={styles.breakdowns}>
        <Breakdown title="Periodtyper" items={data?.breakdowns.periodTypes ?? []} />
        <Breakdown title="Handslagstatus" items={data?.breakdowns.handoffStatuses ?? []} />
        <Breakdown title="Actionstatus" items={data?.breakdowns.actionStatuses ?? []} />
        <Breakdown title="Kontrollpunkter" items={data?.breakdowns.checkpointStatuses ?? []} />
      </section>

      <section className={styles.readingGuide}>
        <h2>Tolkning</h2>
        <p>
          Mätvärdena beskriver endast det valda tidsfönstrets registrerade evidens. Ett ledtidsmått får status <strong>UNDERLAG FINNS</strong> först när minst {data?.interpretation.minimumReliableSample ?? 10} verifierade utfall finns. Fram till dess visas värdet som observation, inte som verksamhetsnorm eller KPI.
        </p>
      </section>
    </main>
  );
}

function Metric({ title, value, emphasis = false }: { title: string; value: number; emphasis?: boolean }) {
  return (
    <div className={`${styles.metric} ${emphasis && value > 0 ? styles.metricEmphasis : ''}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MeasureCard({ title, primary, secondary, sample, reliable }: {
  title: string;
  primary: string;
  secondary: string;
  sample: string;
  reliable: boolean;
}) {
  return (
    <article className={styles.measureCard}>
      <div className={styles.measureTop}>
        <span>{title}</span>
        <strong className={reliable ? styles.reliable : styles.insufficient}>{reliable ? 'UNDERLAG FINNS' : 'FÖR LITET URVAL'}</strong>
      </div>
      <div className={styles.measureValue}>{primary}</div>
      <p>{secondary}</p>
      <small>{sample}</small>
    </article>
  );
}

function Breakdown({ title, items }: { title: string; items: CountItem[] }) {
  return (
    <article className={styles.breakdown}>
      <h2>{title}</h2>
      {items.length ? items.map((item) => (
        <div className={styles.breakdownRow} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.count}</strong>
        </div>
      )) : <p>Ingen registrerad data i valt fönster.</p>}
    </article>
  );
}
