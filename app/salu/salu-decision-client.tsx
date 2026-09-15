'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';
import styles from './salu.module.css';

type SaluPlan = {
  plan_id: string;
  planning_mode: 'QUICK' | 'INDIVIDUAL';
  source_saludatum: string;
  planned_saludatum: string;
  proposed_end_date: string | null;
  salu_destination: string | null;
  transport_mode: 'EJ_BESLUTAD' | 'TRANSPORT' | 'EGEN_KORNING';
  repair_destination: string | null;
  transport_book_by: string | null;
  note: string | null;
  planned_at: string;
};

type SaluRow = {
  flag_id: string;
  regnr: string;
  cycle_saludatum: string;
  current_saludatum: string;
  status: string;
  escalation_status: string;
  created_at: string;
  acknowledged_at: string | null;
  vehicle_state: {
    regnr: string;
    ny_date: string;
    original_saludatum: string;
    current_saludatum: string;
  } | null;
  plan: SaluPlan | null;
  garage_item_id: string | null;
  blockers: {
    waiting_checkpoints: number;
    open_child_processes: number;
  };
};

type JourneyData = {
  found: boolean;
  regnr: string;
  identity: { brand: string | null; model: string | null };
  current: {
    vehicle: Record<string, unknown> | null;
    latestCheckin: {
      completed_at?: string | null;
      current_city?: string | null;
      current_station?: string | null;
      status?: string | null;
    } | null;
  };
  damages: Array<{
    id: string;
    source: string | null;
    damage_type_raw: string | null;
    damage_date: string | null;
    created_at: string;
  }>;
  journey: {
    events: Array<{ event_id: string; event_type: string; occurred_at: string; source_system: string }>;
    periods: Array<{ period_id: string; period_type: string; started_at: string; ended_at: string | null }>;
    openPeriods: Array<{ period_id: string; period_type: string; started_at: string; ended_at: string | null }>;
  };
  salu: {
    checkpoints: Array<{ checkpoint_id: string; checkpoint_code: string; status: string }>;
    childProcesses: Array<{ child_process_id: string; process_type: string; status: string; blocking: boolean }>;
  };
};

type Draft = {
  plannedSaludatum: string;
  proposedEndDate: string;
  saluDestination: string;
  transportMode: 'EJ_BESLUTAD' | 'TRANSPORT' | 'EGEN_KORNING';
  repairDestination: string;
  transportBookBy: string;
  note: string;
};

const emptyDraft = (saludatum = ''): Draft => ({
  plannedSaludatum: saludatum,
  proposedEndDate: '',
  saluDestination: '',
  transportMode: 'EJ_BESLUTAD',
  repairDestination: '',
  transportBookBy: '',
  note: '',
});

export default function SaluDecisionClient() {
  const [rows, setRows] = useState<SaluRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SaluRow | null>(null);
  const [journey, setJourney] = useState<JourneyData | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [savingFlagId, setSavingFlagId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedApiFetch('/api/salu/planning', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Kunde inte läsa SALU-planering');
      const nextRows = (payload.data ?? []) as SaluRow[];
      setRows(nextRows);
      setSelected((current) => current ? nextRows.find((row) => row.flag_id === current.flag_id) ?? null : null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Kunde inte läsa SALU-planering');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const plannedCount = useMemo(() => rows.filter((row) => Boolean(row.plan)).length, [rows]);
  const pendingCount = rows.length - plannedCount;

  const choose = useCallback(async (row: SaluRow) => {
    setSelected(row);
    setDraft(emptyDraft(row.plan?.planned_saludatum ?? row.current_saludatum));
    setJourney(null);
    setError(null);
    setJourneyLoading(true);
    try {
      const response = await authenticatedApiFetch(`/api/vehicle-journey?reg=${encodeURIComponent(row.regnr)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Kunde inte läsa fordonsunderlaget');
      setJourney(payload.data as JourneyData);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Kunde inte läsa fordonsunderlaget');
    } finally {
      setJourneyLoading(false);
    }
  }, []);

  async function plan(row: SaluRow, mode: 'QUICK' | 'INDIVIDUAL') {
    if (row.plan || savingFlagId) return;
    setSavingFlagId(row.flag_id);
    setError(null);
    try {
      const payloadBody = mode === 'QUICK'
        ? { flag_id: row.flag_id, planning_mode: 'QUICK' }
        : {
            flag_id: row.flag_id,
            planning_mode: 'INDIVIDUAL',
            planned_saludatum: draft.plannedSaludatum || null,
            proposed_end_date: draft.proposedEndDate || null,
            salu_destination: draft.saluDestination.trim() || null,
            transport_mode: draft.transportMode,
            repair_destination: draft.repairDestination.trim() || null,
            transport_book_by: draft.transportBookBy || null,
            note: draft.note.trim() || null,
          };

      const response = await authenticatedApiFetch('/api/salu/planning', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payloadBody),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'SALU-planeringen kunde inte sparas');
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'SALU-planeringen kunde inte sparas');
    } finally {
      setSavingFlagId(null);
    }
  }

  if (loading) return <section className={styles.state}>Läser SALU-planering…</section>;

  return (
    <div className={styles.workspace}>
      <section className={styles.listPane}>
        <div className={styles.listHeader}>
          <div className={styles.listMetrics}>
            <span>ATT PLANERA <strong>{pendingCount}</strong></span>
            <span>PLANERADE <strong>{plannedCount}</strong></span>
          </div>
          <button onClick={() => void load()} className={styles.secondaryButton}>Uppdatera</button>
        </div>

        {rows.length === 0 ? (
          <div className={styles.empty}>Inga aktiva SALU-signaler.</div>
        ) : (
          <div className={styles.list}>
            {rows.map((row) => (
              <div key={row.flag_id} className={`${styles.row} ${selected?.flag_id === row.flag_id ? styles.rowSelected : ''}`}>
                <button type="button" className={styles.rowOpen} onClick={() => void choose(row)}>
                  <span className={styles.regnr}>{row.regnr}</span>
                  <span className={styles.date}>SALU {row.current_saludatum}</span>
                  <span className={row.plan ? styles.ready : styles.pending}>
                    {row.plan ? 'PLANERAD SALU' : row.escalation_status === 'NORMAL' ? 'PLANERING KRÄVS' : row.escalation_status}
                  </span>
                </button>
                <label className={styles.quickPlan} title="Använd aktuellt SALU-datum och lämna över arbetsansvaret till Garaget">
                  <input
                    type="checkbox"
                    checked={Boolean(row.plan)}
                    disabled={Boolean(row.plan) || savingFlagId === row.flag_id}
                    onChange={(event) => { if (event.target.checked) void plan(row, 'QUICK'); }}
                  />
                  <span>{savingFlagId === row.flag_id ? 'PLANERAR…' : 'PLANERAD SALU'}</span>
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.decisionPane}>
        {!selected ? (
          <div className={styles.placeholder}>
            <span>SALU PLANERING</span>
            <strong>Välj en bil.</strong>
            <p>Enkla case kan markeras direkt i listan. Öppna bilen när du behöver hela beslutsunderlaget.</p>
          </div>
        ) : (
          <>
            <div className={styles.vehicleHeader}>
              <div>
                <span className={styles.eyebrow}>{selected.plan ? 'PLANERAD SALU' : 'PLANERINGSUNDERLAG'}</span>
                <h2>{selected.regnr}</h2>
              </div>
              <div className={styles.vehicleMeta}>
                <span>Aktuellt SALU-datum</span>
                <strong>{selected.current_saludatum}</strong>
                <Link href={`/vagnkort?reg=${encodeURIComponent(selected.regnr)}`}>Öppna Vagnkort →</Link>
              </div>
            </div>

            {selected.plan ? (
              <section className={styles.planSummary}>
                <div><span>PLANERAD</span><strong>{selected.plan.planned_saludatum}</strong></div>
                <div><span>SALUORT</span><strong>{selected.plan.salu_destination || 'Ej angiven'}</strong></div>
                <div><span>TRANSPORT</span><strong>{selected.plan.transport_mode.replace('_', ' ')}</strong></div>
                <div><span>GARAGE</span><strong>{selected.garage_item_id ? 'Arbetsansvar mottaget' : 'Väntar handoff'}</strong></div>
                {selected.plan.note ? <p>{selected.plan.note}</p> : null}
              </section>
            ) : (
              <>
                <section className={styles.contextGrid}>
                  <ContextCard title="Aktuell status">
                    {journeyLoading ? 'Läser…' : journey?.journey.openPeriods.length
                      ? journey.journey.openPeriods.map((period) => <span key={period.period_id}>{period.period_type}</span>)
                      : 'Ingen öppen period'}
                  </ContextCard>
                  <ContextCard title="Senaste incheckning">
                    {journey?.current.latestCheckin?.completed_at
                      ? `${journey.current.latestCheckin.completed_at.slice(0, 10)} · ${journey.current.latestCheckin.current_station || journey.current.latestCheckin.current_city || 'plats saknas'}`
                      : 'Ingen verifierad incheckning'}
                  </ContextCard>
                  <ContextCard title="Skador">
                    {journey ? `${journey.damages.length} historiska/aktuella poster` : 'Läser…'}
                  </ContextCard>
                  <ContextCard title="Avvikelser">
                    {selected.blockers.waiting_checkpoints + selected.blockers.open_child_processes > 0
                      ? `${selected.blockers.waiting_checkpoints} väntande checkpoints · ${selected.blockers.open_child_processes} öppna processer`
                      : 'Inga öppna SALU-blockerare'}
                  </ContextCard>
                </section>

                {journey?.damages.length ? (
                  <section className={styles.detailList}>
                    <strong>Skador</strong>
                    {journey.damages.slice(0, 5).map((damage) => (
                      <div key={damage.id}><span>{damage.damage_date || damage.created_at.slice(0, 10)}</span><span>{damage.damage_type_raw || damage.source || 'Skada'}</span></div>
                    ))}
                  </section>
                ) : null}

                {journey?.journey.events.length ? (
                  <section className={styles.detailList}>
                    <strong>Senaste fordonsresa</strong>
                    {journey.journey.events.slice(0, 5).map((event) => (
                      <div key={event.event_id}><span>{event.occurred_at.slice(0, 10)}</span><span>{event.event_type}</span></div>
                    ))}
                  </section>
                ) : null}

                <section className={styles.formSection}>
                  <h3>Individuell planering</h3>
                  <div className={styles.formGrid}>
                    <label className={styles.field}><span>Planerat SALU-datum</span><input type="date" value={draft.plannedSaludatum} onChange={(event) => setDraft({ ...draft, plannedSaludatum: event.target.value })} /></label>
                    <label className={styles.field}><span>Föreslaget slutdatum</span><input type="date" value={draft.proposedEndDate} onChange={(event) => setDraft({ ...draft, proposedEndDate: event.target.value })} /></label>
                    <label className={styles.field}><span>SALU-ort / destination</span><input value={draft.saluDestination} onChange={(event) => setDraft({ ...draft, saluDestination: event.target.value })} /></label>
                    <label className={styles.field}><span>Transport</span><select value={draft.transportMode} onChange={(event) => setDraft({ ...draft, transportMode: event.target.value as Draft['transportMode'] })}><option value="EJ_BESLUTAD">Ej beslutad</option><option value="TRANSPORT">Transport</option><option value="EGEN_KORNING">Egen körning</option></select></label>
                    <label className={styles.field}><span>Reparation / verkstad</span><input value={draft.repairDestination} onChange={(event) => setDraft({ ...draft, repairDestination: event.target.value })} /></label>
                    <label className={styles.field}><span>Boka transport senast</span><input type="date" value={draft.transportBookBy} onChange={(event) => setDraft({ ...draft, transportBookBy: event.target.value })} /></label>
                    <label className={`${styles.field} ${styles.fullField}`}><span>Planeringsinformation</span><textarea rows={3} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
                  </div>
                  <div className={styles.commitBox}>
                    <div><span>HANDLING</span><strong>PLANERAD SALU → GARAGET</strong><small>Ändrar inte fysisk plats och startar inte AVVECKLA.</small></div>
                    <button className={styles.primaryButton} disabled={savingFlagId === selected.flag_id || !draft.plannedSaludatum} onClick={() => void plan(selected, 'INDIVIDUAL')}>
                      {savingFlagId === selected.flag_id ? 'Sparar…' : 'Planera SALU'}
                    </button>
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {error && <div className={styles.error}>{error}</div>}
      </section>
    </div>
  );
}

function ContextCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={styles.contextCard}><span>{title}</span><strong>{children}</strong></div>;
}
