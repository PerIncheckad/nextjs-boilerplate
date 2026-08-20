'use client';

import { useEffect, useState } from 'react';

type JourneyMetrics = {
  lifecycleStartAt: string | null;
  lifecycleEndAt: string | null;
  lifecycleOngoing: boolean;
  lifecycleHours: number | null;
  rentalCount: number;
  rentalHours: number;
  downtimeHours: number;
  workshopHours: number;
  availableHours: number;
  transportHours: number;
  measuredOperationalHours: number;
  utilizationPct: number | null;
  overlappingOperationalPeriods: boolean;
  downtimeHoursByReason: Record<string, number>;
  firstRentalAt: string | null;
  nybilToFirstRentalHours: number | null;
  lastRentalReturnAt: string | null;
  saluAt: string | null;
  lastRentalToSaluHours: number | null;
  betweenRentalGapCount: number;
  averageHoursBetweenRentals: number | null;
  longestHoursBetweenRentals: number | null;
};

type MetricsResponse = {
  data?: {
    regnr: string;
    metrics: JourneyMetrics;
    coverage: {
      periodCount: number;
      hasLifecycleStart: boolean;
      hasLifecycleEnd: boolean;
      hasSaluDate: boolean;
    };
  };
  error?: string;
};

type Props = {
  regnr: string;
  refreshNonce: number;
};

const reasonLabels: Record<string, string> = {
  DAMAGE: 'Skada',
  WORKSHOP: 'Verkstad',
  SERVICE: 'Service',
  WAITING_PARTS: 'Väntar reservdelar',
  MISSING_EQUIPMENT: 'Saknad utrustning',
  TRANSPORT: 'Transport',
  ADMINISTRATION: 'Administration',
  OTHER: 'Övrigt',
  UNSPECIFIED: 'Ej angiven',
};

function formatHours(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  if (value >= 24) return `${Math.round((value / 24) * 10) / 10} dygn`;
  return `${value} h`;
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value} %`;
}

export default function JourneyMetricsPanel({ regnr, refreshNonce }: Props) {
  const [metrics, setMetrics] = useState<JourneyMetrics | null>(null);
  const [periodCount, setPeriodCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/vehicle-journey/metrics?reg=${encodeURIComponent(regnr)}`);
        const body = await response.json() as MetricsResponse;
        if (!response.ok || !body.data) throw new Error(body.error || 'Kunde inte hämta resans nyckeltal');
        if (!cancelled) {
          setMetrics(body.data.metrics);
          setPeriodCount(body.data.coverage.periodCount);
        }
      } catch (err) {
        if (!cancelled) {
          setMetrics(null);
          setError(err instanceof Error ? err.message : 'Kunde inte hämta resans nyckeltal');
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
  }, [regnr, refreshNonce]);

  if (loading) return <p style={{ color: '#666' }}>Räknar resans nyckeltal…</p>;
  if (error) return <p style={{ color: '#a00' }}>{error}</p>;
  if (!metrics) return null;

  const downtimeReasons = Object.entries(metrics.downtimeHoursByReason)
    .sort((left, right) => right[1] - left[1]);

  const stats: Array<[string, string]> = [
    ['Livscykel', formatHours(metrics.lifecycleHours)],
    ['Uthyrningar', String(metrics.rentalCount)],
    ['Uthyrd tid', formatHours(metrics.rentalHours)],
    ['Nyttjandegrad', formatPercent(metrics.utilizationPct)],
    ['Stillestånd', formatHours(metrics.downtimeHours)],
    ['Verkstad', formatHours(metrics.workshopHours)],
    ['Nybil → första uthyrning', formatHours(metrics.nybilToFirstRentalHours)],
    ['Snitt mellan uthyrningar', formatHours(metrics.averageHoursBetweenRentals)],
    ['Sista retur → SALU', formatHours(metrics.lastRentalToSaluHours)],
  ];

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ fontWeight: 700, marginBottom: '.55rem' }}>Resans nyckeltal</div>
      {periodCount === 0 && (
        <div style={{ background: '#f6f6f6', borderRadius: 8, padding: '.65rem .75rem', marginBottom: '.7rem', color: '#555' }}>
          Ingen periodhistorik ännu. Nyckeltalen fylls på när uthyrning, stillestånd, verkstad och andra perioder registreras.
        </div>
      )}
      {metrics.overlappingOperationalPeriods && (
        <div style={{ background: '#fff2db', borderRadius: 8, padding: '.65rem .75rem', marginBottom: '.7rem' }}>
          Operativa perioder överlappar. Nyttjandegrad visas därför inte förrän tidslinjen är entydig.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.55rem' }}>
        {stats.map(([label, value]) => (
          <div key={label} style={{ border: '1px solid #e4e4e4', borderRadius: 8, padding: '.65rem' }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: '.2rem' }}>{label}</div>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {downtimeReasons.length > 0 && (
        <div style={{ marginTop: '.8rem' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: '.25rem' }}>Stillestånd per orsak</div>
          {downtimeReasons.map(([reason, total]) => (
            <div key={reason} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '.3rem 0', borderTop: '1px solid #eee' }}>
              <span>{reasonLabels[reason] ?? reason}</span>
              <strong>{formatHours(total)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
