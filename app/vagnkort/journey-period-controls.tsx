'use client';

import { useMemo } from 'react';

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

function stateLabel(periodType: string) {
  switch (periodType) {
    case 'AVAILABLE': return 'Tillgänglig';
    case 'RENTAL': return 'Uthyrd';
    case 'DOWNTIME': return 'Stillestånd';
    case 'PREPARATION': return 'Förberedelse';
    case 'SALU': return 'SALU';
    default: return periodType;
  }
}

export default function JourneyPeriodControls({ openPeriods }: Props) {
  const currentPrimary = useMemo(
    () => openPeriods.find((period) => period.ended_at === null) ?? null,
    [openPeriods],
  );

  return (
    <div style={{ display: 'grid', gap: '.9rem' }}>
      <div style={{ background: '#f6f6f6', borderRadius: 8, padding: '.65rem .75rem', fontSize: 13, color: '#555' }}>
        Huvudtillståndet är verifierad verksamhetsdata och ändras av den källa som faktiskt vet. Vagnkortet visar läget men skapar eller avslutar inte huvudperioder manuellt.
      </div>

      {currentPrimary ? (
        <div style={{ display: 'grid', gap: '.45rem' }}>
          <strong>Aktuellt huvudtillstånd</strong>
          <div style={{ borderTop: '1px solid #eee', paddingTop: '.5rem' }}>
            <div><strong>{stateLabel(currentPrimary.period_type)}</strong> <span style={{ color: '#777' }}>({currentPrimary.period_type})</span></div>
            <div style={{ fontSize: 13, color: '#666', marginTop: '.2rem' }}>
              Sedan {new Date(currentPrimary.started_at).toLocaleString('sv-SE')}
              {currentPrimary.reason_text ? ` · ${currentPrimary.reason_text}` : currentPrimary.reason_code ? ` · ${currentPrimary.reason_code}` : ''}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <strong>Inget verifierat huvudtillstånd</strong>
          <div style={{ fontSize: 13, color: '#666', marginTop: '.2rem' }}>
            Incheckad gissar inte nästa läge. Nästa huvudtillstånd kommer från en verifierad källa.
          </div>
        </div>
      )}
    </div>
  );
}
