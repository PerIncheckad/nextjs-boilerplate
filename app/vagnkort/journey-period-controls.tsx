'use client';

import { FormEvent, useMemo, useState } from 'react';

type JourneyPeriod = {
  period_id: string;
  period_type: string;
  started_at: string;
  ended_at: string | null;
  reason_code: string | null;
  reason_text: string | null;
  durationHours: number | null;
};

type Props = {
  regnr: string;
  openPeriods: JourneyPeriod[];
  onChanged: () => void;
};

const PERIOD_TYPES = [
  ['AVAILABLE', 'Tillgänglig'],
  ['RENTAL', 'Uthyrd'],
  ['DOWNTIME', 'Stillestånd'],
  ['WORKSHOP', 'Verkstad'],
  ['TRANSPORT', 'Transport'],
  ['PREPARATION', 'Förberedelse'],
  ['SALU', 'SALU'],
  ['OTHER', 'Övrigt'],
] as const;

const DOWNTIME_REASONS = [
  ['DAMAGE', 'Skada'],
  ['WORKSHOP', 'Verkstad'],
  ['SERVICE', 'Service'],
  ['WAITING_PARTS', 'Väntar reservdelar'],
  ['MISSING_EQUIPMENT', 'Saknad utrustning'],
  ['TRANSPORT', 'Transport'],
  ['ADMINISTRATION', 'Administration'],
  ['OTHER', 'Övrigt'],
] as const;

function localDateTimeValue(date = new Date()) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export default function JourneyPeriodControls({ regnr, openPeriods, onChanged }: Props) {
  const [periodType, setPeriodType] = useState('RENTAL');
  const [startedAt, setStartedAt] = useState(localDateTimeValue);
  const [reasonCode, setReasonCode] = useState('DAMAGE');
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const openByType = useMemo(
    () => new Map(openPeriods.map((period) => [period.period_type, period])),
    [openPeriods],
  );

  async function startPeriod(event: FormEvent) {
    event.preventDefault();
    setBusy('start');
    setMessage('');
    try {
      const response = await fetch('/api/vehicle-journey/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'START',
          regnr,
          periodType,
          startedAt: new Date(startedAt).toISOString(),
          reasonCode: periodType === 'DOWNTIME' ? reasonCode : null,
          reasonText: periodType === 'DOWNTIME' ? reasonText.trim() || null : null,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Kunde inte starta perioden');
      setMessage('Perioden är startad.');
      setStartedAt(localDateTimeValue());
      setReasonText('');
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kunde inte starta perioden.');
    } finally {
      setBusy(null);
    }
  }

  async function closePeriod(period: JourneyPeriod) {
    setBusy(period.period_id);
    setMessage('');
    try {
      const response = await fetch('/api/vehicle-journey/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CLOSE',
          regnr,
          periodId: period.period_id,
          endedAt: new Date().toISOString(),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Kunde inte avsluta perioden');
      setMessage('Perioden är avslutad.');
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kunde inte avsluta perioden.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '.9rem' }}>
      {openPeriods.length > 0 && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <strong>Pågående perioder</strong>
          {openPeriods.map((period) => (
            <div key={period.period_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', borderTop: '1px solid #eee', paddingTop: '.5rem' }}>
              <div>
                <div><strong>{period.period_type}</strong></div>
                <div style={{ fontSize: 13, color: '#666' }}>{new Date(period.started_at).toLocaleString('sv-SE')}{period.reason_text ? ` · ${period.reason_text}` : period.reason_code ? ` · ${period.reason_code}` : ''}</div>
              </div>
              <button type="button" onClick={() => void closePeriod(period)} disabled={Boolean(busy)} style={{ border: 0, borderRadius: 8, background: '#111', color: '#fff', padding: '.55rem .75rem', fontWeight: 700 }}>
                {busy === period.period_id ? 'Avslutar…' : 'Avsluta nu'}
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={startPeriod} style={{ display: 'grid', gap: '.65rem' }}>
        <strong>Starta ny period</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.6rem' }}>
          <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
            Typ
            <select value={periodType} onChange={(event) => setPeriodType(event.target.value)} disabled={Boolean(busy)} style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }}>
              {PERIOD_TYPES.map(([value, label]) => (
                <option key={value} value={value} disabled={openByType.has(value)}>{label}{openByType.has(value) ? ' · pågår' : ''}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
            Starttid
            <input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} disabled={Boolean(busy)} required style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }} />
          </label>
        </div>

        {periodType === 'DOWNTIME' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.6rem' }}>
            <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
              Orsak
              <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} disabled={Boolean(busy)} style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }}>
                {DOWNTIME_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
              Kommentar {reasonCode === 'OTHER' ? '(krävs)' : '(valfri)'}
              <input value={reasonText} onChange={(event) => setReasonText(event.target.value)} required={reasonCode === 'OTHER'} disabled={Boolean(busy)} placeholder="T.ex. väntar delar från leverantör" style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }} />
            </label>
          </div>
        )}

        <button type="submit" disabled={Boolean(busy) || openByType.has(periodType)} style={{ justifySelf: 'start', border: 0, borderRadius: 8, background: '#111', color: '#fff', padding: '.65rem 1rem', fontWeight: 700 }}>
          {busy === 'start' ? 'Startar…' : 'Starta period'}
        </button>
      </form>

      {message && <div style={{ fontSize: 13, color: message.includes('Kunde') || message.includes('Invalid') || message.includes('already') ? '#a00' : '#176b2c' }}>{message}</div>}
    </div>
  );
}
