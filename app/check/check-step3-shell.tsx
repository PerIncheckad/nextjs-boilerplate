'use client';

import { useEffect, useRef, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';
import FormClient from './form-client';
import styles from './check-step3-shell.module.css';

type SaluFinalContext = {
  garage_item_id: string;
  regnr: string;
  source_plan: {
    planned_saludatum: string;
    salu_destination: string | null;
    repair_destination: string | null;
  };
  garage: {
    planned_station: string | null;
    salu_final_timing_at: string | null;
    salu_transport_details: string | null;
    salu_repair_destination: string | null;
    salu_operational_note: string | null;
  };
  sista_hyran: {
    decision_id: string;
    decision_version: number;
    last_rental_at: string | null;
    decision_note: string | null;
    decided_at: string;
  };
  sista_incheckning: {
    checkin_id: string;
    final_checkin_completed_at: string;
    verified_at: string;
  } | null;
};

function normalizeReg(value: string): string {
  return value.toUpperCase().replace(/\s/g, '');
}

function displayDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

export default function CheckStep3Shell() {
  const [reg, setReg] = useState('');
  const [context, setContext] = useState<SaluFinalContext | null>(null);
  const [arming, setArming] = useState(false);
  const [armReady, setArmReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const fromUrl = normalizeReg(new URLSearchParams(window.location.search).get('reg') ?? '');
    if (!fromUrl) return;
    const timer = window.setTimeout(() => setReg(fromUrl), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (reg.length < 6) return;
    const currentSequence = ++sequence.current;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await authenticatedApiFetch(`/api/check/salu-final?reg=${encodeURIComponent(reg)}`, { cache: 'no-store' });
          const payload = await response.json();
          if (currentSequence !== sequence.current) return;
          if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa SISTA HYRAN-underlaget');
          const next = (payload.data ?? null) as SaluFinalContext | null;
          setContext(next);
          if (!next) return;

          setArming(true);
          const armResponse = await authenticatedApiFetch('/api/check/salu-final/arm', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              garage_item_id: next.garage_item_id,
              decision_id: next.sista_hyran.decision_id,
            }),
          });
          const armPayload = await armResponse.json();
          if (currentSequence !== sequence.current) return;
          if (!armResponse.ok) throw new Error(armPayload?.error ?? 'Kunde inte förbereda exakt SISTA INCHECKNING');
          setArmReady(true);
        } catch (loadError) {
          if (currentSequence !== sequence.current) return;
          setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa SISTA HYRAN-underlaget');
        } finally {
          if (currentSequence === sequence.current) setArming(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [reg]);

  function handleInputCapture(event: React.FormEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains('reg-input')) return;
    sequence.current += 1;
    setContext(null);
    setArmReady(false);
    setArming(false);
    setError(null);
    setReg(normalizeReg(target.value));
  }

  return (
    <div onInputCapture={handleInputCapture}>
      {context ? (
        <aside className={styles.notice} aria-live="polite">
          <div className={styles.heading}>
            <div>
              <span>GARAGE / SISTA HYRAN</span>
              <strong>SISTA HYRAN – BILEN SKA VIDARE TILL SALU</strong>
            </div>
            <em>{context.sista_incheckning ? 'SISTA INCHECKNING REDAN VERIFIERAD' : arming ? 'KNYTER EXAKT BESLUT…' : armReady ? 'EXAKT BESLUT KNYTET' : 'VÄNTAR'}</em>
          </div>
          <div className={styles.facts}>
            <div><span>PLANERAT SALU-DATUM</span><strong>{context.source_plan.planned_saludatum || '—'}</strong></div>
            <div><span>GARAGE SLUTLIG TIMING</span><strong>{displayDateTime(context.garage.salu_final_timing_at)}</strong></div>
            <div><span>DESTINATION</span><strong>{context.source_plan.salu_destination || context.garage.planned_station || '—'}</strong></div>
            <div><span>TRANSPORT</span><strong>{context.garage.salu_transport_details || '—'}</strong></div>
            <div><span>VERKSTAD / REPARATION</span><strong>{context.garage.salu_repair_destination || context.source_plan.repair_destination || '—'}</strong></div>
            <div><span>SISTA HYRAN TIMING</span><strong>{displayDateTime(context.sista_hyran.last_rental_at)}</strong></div>
            <div className={styles.wide}><span>GARAGE OPERATIV KOMMENTAR</span><strong>{context.garage.salu_operational_note || '—'}</strong></div>
            <div className={styles.wide}><span>BESLUTSANTECKNING</span><strong>{context.sista_hyran.decision_note || '—'}</strong></div>
          </div>
          <small className={styles.source}>Read-only från SALU, Garage och exakt SISTA HYRAN version {context.sista_hyran.decision_version}. Den normala Check-in-processen äger fortsatt verklig observation, skador, utrustning och checklist.</small>
          {error ? <div className={styles.error}>{error}</div> : null}
        </aside>
      ) : error ? <div className={styles.errorStandalone}>{error}</div> : null}
      <FormClient />
    </div>
  );
}
