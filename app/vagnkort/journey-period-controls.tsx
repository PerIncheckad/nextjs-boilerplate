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

const PRIMARY_PERIOD_TYPES = [
  ['AVAILABLE', 'Tillgänglig'],
  ['RENTAL', 'Uthyrd'],
  ['DOWNTIME', 'Stillestånd'],
  ['PREPARATION', 'Förberedelse'],
  ['SALU', 'SALU'],
  ['OTHER', 'Övrigt huvudtillstånd'],
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
  const [periodType, setPeriodType] = useState('AVAILABLE');
  const [startedAt, setStartedAt] = useState(localDateTimeValue);
  const [reasonCode, setReasonCode] = useState('DAMAGE');
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const currentPrimary = useMemo(
    () => openPeriods.find((period) => period.ended_at === null) ?? null,
    [openPeriods],
  );

  async function transitionPeriod(event: FormEvent) {
    event.preventDefault();
    setBusy('transition');
    setMessage('');
    try {
      const response = await fetch('/api/vehicle-journey/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TRANSITION',
          regnr,
          periodType,
          startedAt: new Date(startedAt).toISOString(),
          reasonCode: periodType === 'DOWNTIME' ? reasonCode : null,
          reasonText: periodType === 'DOWNTIME' ? reasonText.trim() || null : null,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Kunde inte byta huvudtillstånd');
      setMessage('Bilens huvudtillstånd är uppdaterat. Föregående period avslutades vid samma tidpunkt.');
      setStartedAt(localDateTimeValue());
      setReasonText('');
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kunde inte byta huvudtillstånd.');
    } finally {
      setBusy(null);
    }
  }

  async function closeCurrent(period: JourneyPeriod) {
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
      if (!response.ok) throw new Error(body.error || 'Kunde inte avsluta huvudperioden');
      setMessage('Huvudperioden är avslutad. Bilen saknar därefter fastställt huvudtillstånd tills nästa period startas.');
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kunde inte avsluta huvudperioden.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '.9rem' }}>
      <div style={{ background: '#f6f6f6', borderRadius: 8, padding: '.65rem .75rem', fontSize: 13, color: '#555' }}>
        En bil har ett huvudtillstånd åt gången. Verkstad, service, transport och väntetid är aktiviteter inom ett stillestånd och räknas inte som parallella huvudperioder.
      </div>

      {currentPrimary && (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <strong>Aktuellt huvudtillstånd</strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', borderTop: '1px solid #eee', paddingTop: '.5rem' }}>
            <div>
              <div><strong>{currentPrimary.period_type}</strong></div>
              <div style={{ fontSize: 13, color: '#666' }}>{new Date(currentPrimary.started_at).toLocaleString('sv-SE')}{currentPrimary.reason_text ? ` · ${currentPrimary.reason_text}` : currentPrimary.reason_code ? ` · ${currentPrimary.reason_code}` : ''}</div>
            </div>
            <button type="button" onClick={() => void closeCurrent(currentPrimary)} disabled={Boolean(busy)} style={{ border: 0, borderRadius: 8, background: '#111', color: '#fff', padding: '.55rem .75rem', fontWeight: 700 }}>
              {busy === currentPrimary.period_id ? 'Avslutar…' : 'Avsluta utan nytt tillstånd'}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={transitionPeriod} style={{ display: 'grid', gap: '.65rem' }}>
        <strong>{currentPrimary ? 'Byt huvudtillstånd' : 'Starta huvudtillstånd'}</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.6rem' }}>
          <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
            Tillstånd
            <select value={periodType} onChange={(event) => setPeriodType(event.target.value)} disabled={Boolean(busy)} style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }}>
              {PRIMARY_PERIOD_TYPES.map(([value, label]) => (
                <option key={value} value={value} disabled={currentPrimary?.period_type === value}>{label}{currentPrimary?.period_type === value ? ' · pågår' : ''}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
            Tidpunkt för bytet
            <input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} disabled={Boolean(busy)} required style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }} />
          </label>
        </div>

        {periodType === 'DOWNTIME' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.6rem' }}>
            <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
              Huvudorsak
              <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} disabled={Boolean(busy)} style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }}>
                {DOWNTIME_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '.25rem', fontSize: 13 }}>
              Kommentar {reasonCode === 'OTHER' ? '(krävs)' : '(valfri)'}
              <input value={reasonText} onChange={(event) => setReasonText(event.target.value)} required={reasonCode === 'OTHER'} disabled={Boolean(busy)} placeholder="T.ex. skada, väntar delar eller administrativ spärr" style={{ padding: '.65rem', border: '1px solid #bbb', borderRadius: 8 }} />
            </label>
          </div>
        )}

        <button type="submit" disabled={Boolean(busy) || currentPrimary?.period_type === periodType} style={{ justifySelf: 'start', border: 0, borderRadius: 8, background: '#111', color: '#fff', padding: '.65rem 1rem', fontWeight: 700 }}>
          {busy === 'transition' ? 'Sparar…' : currentPrimary ? 'Byt tillstånd' : 'Starta tillstånd'}
        </button>
      </form>

      {message && <div style={{ fontSize: 13, color: message.includes('Kunde') || message.includes('Invalid') || message.includes('already') ? '#a00' : '#176b2c' }}>{message}</div>}
    </div>
  );
}
