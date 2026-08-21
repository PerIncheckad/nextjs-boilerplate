'use client';

import { FormEvent, useState } from 'react';

type JourneyPeriod = {
  period_id: string;
  period_type: string;
  started_at: string;
  ended_at: string | null;
  reason_code: string | null;
  reason_text: string | null;
};

type Props = {
  regnr: string;
  openPeriods: JourneyPeriod[];
  onChanged: () => void;
};

const TYPES = [
  ['AVAILABLE', 'Tillgänglig'],
  ['RENTAL', 'Uthyrd'],
  ['DOWNTIME', 'Stillestånd'],
  ['WORKSHOP', 'Verkstad'],
  ['TRANSPORT', 'Transport'],
  ['PREPARATION', 'Förberedelse'],
  ['SALU', 'SALU'],
  ['OTHER', 'Övrigt'],
] as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('sv-SE');
}

export default function PeriodManager({ regnr, openPeriods, onChanged }: Props) {
  const [periodType, setPeriodType] = useState('AVAILABLE');
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function startPeriod(event: FormEvent) {
    event.preventDefault();
    setBusy('start');
    setMessage('');
    try {
      const response = await fetch('/api/vehicle-journey-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          regnr,
          periodType,
          reasonText: reasonText || null,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Kunde inte starta perioden');
      setReasonText('');
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kunde inte starta perioden');
    } finally {
      setBusy(null);
    }
  }

  async function endPeriod(periodId: string) {
    setBusy(periodId);
    setMessage('');
    try {
      const response = await fetch('/api/vehicle-journey-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', regnr, periodId }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Kunde inte avsluta perioden');
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kunde inte avsluta perioden');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Aktuell period</h2>
      {openPeriods.length === 0 ? (
        <p>Ingen öppen period.</p>
      ) : (
        <div style={{ marginBottom: '1rem' }}>
          {openPeriods.map((period) => (
            <div key={period.period_id} style={{ display: 'flex', gap: '.8rem', alignItems: 'center', justifyContent: 'space-between', padding: '.6rem 0', borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
              <div>
                <strong>{period.period_type}</strong>
                <div style={{ color: '#666', fontSize: 13 }}>{formatDate(period.started_at)}{period.reason_text ? ` · ${period.reason_text}` : ''}</div>
              </div>
              <button type="button" onClick={() => void endPeriod(period.period_id)} disabled={busy !== null} style={{ border: '1px solid #aaa', borderRadius: 7, background: '#fff', padding: '.5rem .75rem', cursor: 'pointer' }}>
                {busy === period.period_id ? 'Avslutar…' : 'Avsluta period'}
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={startPeriod} style={{ display: 'grid', gap: '.6rem' }}>
        <label style={{ display: 'grid', gap: '.25rem' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Ny period</span>
          <select value={periodType} onChange={(event) => setPeriodType(event.target.value)} disabled={busy !== null} style={{ padding: '.65rem', borderRadius: 7, border: '1px solid #bbb' }}>
            {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: '.25rem' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Orsak / kommentar</span>
          <input value={reasonText} onChange={(event) => setReasonText(event.target.value)} maxLength={500} placeholder="Valfritt" disabled={busy !== null} style={{ padding: '.65rem', borderRadius: 7, border: '1px solid #bbb' }} />
        </label>
        <button type="submit" disabled={busy !== null} style={{ border: 0, borderRadius: 7, background: '#111', color: '#fff', padding: '.65rem .8rem', fontWeight: 700, cursor: 'pointer' }}>
          {busy === 'start' ? 'Startar…' : 'Starta period'}
        </button>
      </form>
      {message && <div style={{ color: '#a00', marginTop: '.65rem' }}>{message}</div>}
    </div>
  );
}
