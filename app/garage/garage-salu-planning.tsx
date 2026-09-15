'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedApiFetch } from '@/lib/api-auth-client';
import styles from './garage.module.css';

type PlanningStation = { station_code: string; display_name: string | null; sort_order: number };

type SaluPlan = {
  plan_id: string;
  flag_id: string;
  regnr: string;
  planning_mode: 'QUICK' | 'INDIVIDUAL';
  source_saludatum: string;
  planned_saludatum: string;
  proposed_end_date: string | null;
  salu_destination: string | null;
  transport_mode: 'EJ_BESLUTAD' | 'TRANSPORT' | 'EGEN_KORNING';
  repair_destination: string | null;
  transport_book_by: string | null;
  note: string | null;
  status: 'PLANERAD';
  planned_at: string;
};

type SistaHyran = {
  decision_id: string;
  decision_version: number;
  decision_status: 'SISTA HYRAN';
  last_rental_at: string | null;
  decision_note: string | null;
  decided_at: string;
  decided_by_employee_id: string;
  supersedes_decision_id: string | null;
};

type SaluGarageItem = {
  garage_item_id: string;
  model: string;
  regnr: string | null;
  garage_direction: null;
  source_kind: 'SALU_PLANERING';
  source_salu_flag_id: string;
  planned_station: string | null;
  transport_status: 'EJ_BOKAD' | 'TRANSPORTBOKAD' | 'PA_VAG';
  salu_final_timing_at: string | null;
  salu_transport_details: string | null;
  salu_repair_destination: string | null;
  salu_operational_note: string | null;
  updated_at: string;
  source_plan: SaluPlan | null;
  sista_hyran: SistaHyran | null;
};

type JourneyData = {
  identity: { brand: string | null; model: string | null };
  current: {
    latestCheckin: {
      completed_at?: string | null;
      current_city?: string | null;
      current_station?: string | null;
      status?: string | null;
    } | null;
  };
  damages: Array<{ id: string }>;
  journey: {
    openPeriods: Array<{ period_id: string; period_type: string; started_at: string; ended_at: string | null }>;
  };
};

type Authorization = {
  employee_resolved: boolean;
  can_decide_sista_hyran: boolean;
};

function dateTimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function GarageSaluPlanning({ stations }: { stations: PlanningStation[] }) {
  const [items, setItems] = useState<SaluGarageItem[]>([]);
  const [authorization, setAuthorization] = useState<Authorization>({ employee_resolved: false, can_decide_sista_hyran: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [journey, setJourney] = useState<JourneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionTiming, setDecisionTiming] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionKey, setDecisionKey] = useState(() => crypto.randomUUID());

  const selected = useMemo(() => items.find((item) => item.garage_item_id === selectedId) ?? null, [items, selectedId]);

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    try {
      const response = await authenticatedApiFetch('/api/garage/salu-planning', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa SALU PLANERING');
      const nextItems = (payload.data ?? []) as SaluGarageItem[];
      setItems(nextItems);
      setAuthorization(payload.authorization ?? { employee_resolved: false, can_decide_sista_hyran: false });
      setSelectedId((current) => current && nextItems.some((item) => item.garage_item_id === current) ? current : nextItems[0]?.garage_item_id ?? null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa SALU PLANERING');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected?.regnr) return;
    let active = true;
    void authenticatedApiFetch(`/api/vehicle-journey?reg=${encodeURIComponent(selected.regnr)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Fordonsresa');
        if (active) setJourney(payload.data as JourneyData);
      })
      .catch(() => { if (active) setJourney(null); });
    return () => { active = false; };
  }, [selected?.regnr]);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      setDecisionTiming(dateTimeLocal(selected.sista_hyran?.last_rental_at ?? selected.salu_final_timing_at));
      setDecisionNote(selected.sista_hyran?.decision_note ?? '');
      setDecisionKey(crypto.randomUUID());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selected]);

  async function patch(item: SaluGarageItem, changes: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const response = await authenticatedApiFetch('/api/garage/salu-planning', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ garage_item_id: item.garage_item_id, ...changes }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte spara Garage-kompletteringen');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kunde inte spara Garage-kompletteringen');
    } finally {
      setSaving(false);
    }
  }

  async function decide(item: SaluGarageItem) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await authenticatedApiFetch('/api/garage/salu-planning', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'SISTA_HYRAN',
          garage_item_id: item.garage_item_id,
          last_rental_at: decisionTiming || null,
          decision_note: decisionNote.trim() || null,
          idempotency_key: decisionKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'SISTA HYRAN kunde inte sparas');
      setDecisionKey(crypto.randomUUID());
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'SISTA HYRAN kunde inte sparas');
    } finally {
      setSaving(false);
    }
  }

  if (loading && items.length === 0) return <section className={styles.saluPlanningPanel}><strong>SALU PLANERING</strong><span>Läser arbetsansvar…</span></section>;
  if (items.length === 0) return null;

  return (
    <section className={styles.saluPlanningPanel}>
      <div className={styles.saluPlanningHeader}>
        <div><span className={styles.eyebrow}>GARAGE / OPERATIVT ARBETSANSVAR</span><h2>SALU PLANERING</h2><p>Riktningslös planering. Ingen fysisk IN/UT-position påstås.</p></div>
        <strong>{items.length} OBJEKT</strong>
      </div>

      <div className={styles.saluPlanningLayout}>
        <div className={styles.saluPlanningList}>
          {items.map((item) => (
            <button key={item.garage_item_id} type="button" className={`${styles.saluPlanningRow} ${selectedId === item.garage_item_id ? styles.saluPlanningRowActive : ''}`} onClick={() => { setJourney(null); setSelectedId(item.garage_item_id); }}>
              <strong>{item.regnr || 'REG SAKNAS'}</strong>
              <span>{item.model}</span>
              <span>{item.source_plan?.planned_saludatum ? `SALU ${item.source_plan.planned_saludatum}` : 'Källplan saknas'}</span>
              <em>{item.sista_hyran ? 'SISTA HYRAN BESLUTAD' : 'OPERATIV PLANERING'}</em>
            </button>
          ))}
        </div>

        {selected ? (
          <div className={styles.saluPlanningDetail}>
            <div className={styles.saluPlanningIdentity}>
              <div><span>KÄLLA</span><strong>SALU PLANERING</strong></div>
              <div><span>REG.NR</span><strong>{selected.regnr || '—'}</strong></div>
              <div><span>RIKTNING</span><strong>INGEN FYSISK IN/UT</strong></div>
              {selected.regnr ? <Link href={`/vagnkort?reg=${encodeURIComponent(selected.regnr)}`}>Öppna Vagnkort →</Link> : null}
            </div>

            {selected.source_plan ? (
              <div className={styles.saluSourceFacts}>
                <div><span>URSPRUNGLIGT SALU-DATUM</span><strong>{selected.source_plan.source_saludatum}</strong></div>
                <div><span>PLANERAT SALU-DATUM</span><strong>{selected.source_plan.planned_saludatum}</strong></div>
                <div><span>FÖRESLAGET SLUTDATUM</span><strong>{selected.source_plan.proposed_end_date || '—'}</strong></div>
                <div><span>SALU-ORT</span><strong>{selected.source_plan.salu_destination || '—'}</strong></div>
                <div><span>TRANSPORTLÄGE</span><strong>{selected.source_plan.transport_mode.replace('_', ' ')}</strong></div>
                <div><span>REPARATION / VERKSTAD</span><strong>{selected.source_plan.repair_destination || '—'}</strong></div>
                <div><span>BOKA TRANSPORT SENAST</span><strong>{selected.source_plan.transport_book_by || '—'}</strong></div>
                <div className={styles.saluWideFact}><span>SALU-PLANERINGSANTECKNING</span><strong>{selected.source_plan.note || '—'}</strong></div>
              </div>
            ) : <div className={styles.error}>Exakt SALU-plan saknas. Operativt beslut blockeras.</div>}

            <div className={styles.saluVehicleContext}>
              <div><span>AKTUELL STATUS</span><strong>{journey?.journey.openPeriods.length ? journey.journey.openPeriods.map((period) => period.period_type).join(', ') : 'Ingen öppen period'}</strong></div>
              <div><span>SENASTE INCHECKNING</span><strong>{journey?.current.latestCheckin?.completed_at ? `${journey.current.latestCheckin.completed_at.slice(0, 10)} · ${journey.current.latestCheckin.current_station || journey.current.latestCheckin.current_city || 'plats saknas'}` : 'Ingen verifierad incheckning'}</strong></div>
              <div><span>SKADOR</span><strong>{journey ? `${journey.damages.length} poster` : 'Läser Fordonsresa…'}</strong></div>
            </div>

            <div className={styles.saluOperationalGrid}>
              <label><span>STATION / PLATS</span><select value={selected.planned_station ?? ''} disabled={saving} onChange={(event) => void patch(selected, { planned_station: event.target.value || null, station_change_reason: 'SALU operativ planering' })}><option value="">Ej fastställd</option>{stations.map((station) => <option key={station.station_code} value={station.station_code}>{station.display_name || station.station_code}</option>)}</select></label>
              <label><span>TRANSPORTSTATUS</span><select value={selected.transport_status} disabled={saving} onChange={(event) => void patch(selected, { transport_status: event.target.value })}><option value="EJ_BOKAD">Ej bokad</option><option value="TRANSPORTBOKAD">Transport bokad</option><option value="PA_VAG">På väg</option></select></label>
              <label><span>DEFINITIV TIMING</span><input type="datetime-local" defaultValue={dateTimeLocal(selected.salu_final_timing_at)} disabled={saving} onBlur={(event) => void patch(selected, { salu_final_timing_at: event.target.value || null })} /></label>
              <label><span>TRANSPORTINFORMATION</span><input defaultValue={selected.salu_transport_details ?? ''} disabled={saving} onBlur={(event) => void patch(selected, { salu_transport_details: event.target.value || null })} /></label>
              <label><span>VERKSTAD / REPARATION</span><input defaultValue={selected.salu_repair_destination ?? ''} disabled={saving} onBlur={(event) => void patch(selected, { salu_repair_destination: event.target.value || null })} /></label>
              <label className={styles.saluOperationalWide}><span>OPERATIV KOMMENTAR</span><textarea rows={2} defaultValue={selected.salu_operational_note ?? ''} disabled={saving} onBlur={(event) => void patch(selected, { salu_operational_note: event.target.value || null })} /></label>
            </div>

            <div className={styles.sistaHyranBox}>
              <div>
                <span>EXPLICIT VERKSAMHETSBESLUT</span>
                <strong>SISTA HYRAN</strong>
                <small>Ett datum är endast beslutsunderlag. Beslutet finns först när denna handling genomförs med giltigt mandat.</small>
              </div>
              {selected.sista_hyran ? <div className={styles.sistaHyranCurrent}><span>AKTUELL VERSION {selected.sista_hyran.decision_version}</span><strong>{selected.sista_hyran.last_rental_at ? new Date(selected.sista_hyran.last_rental_at).toLocaleString('sv-SE') : 'Timing ej angiven'}</strong><small>Beslutad {new Date(selected.sista_hyran.decided_at).toLocaleString('sv-SE')}</small></div> : null}
              <label><span>SLUTLIG TIMING (VALFRI)</span><input type="datetime-local" value={decisionTiming} onChange={(event) => setDecisionTiming(event.target.value)} /></label>
              <label><span>BESLUTSKOMMENTAR</span><input value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label>
              <button className={styles.primaryButton} type="button" disabled={saving || !authorization.can_decide_sista_hyran || !selected.source_plan} onClick={() => void decide(selected)}>{saving ? 'SPARAR…' : selected.sista_hyran ? 'ÄNDRA SISTA HYRAN' : 'BESLUTA SISTA HYRAN'}</button>
              {!authorization.employee_resolved ? <small>Ingen exakt aktiv employee-identitet kunde verifieras.</small> : !authorization.can_decide_sista_hyran ? <small>Inloggad employee saknar mandat BILKONTROLLCHEF / GARAGE_SISTA_HYRAN_DECIDE / PROCESS SALU.</small> : null}
            </div>
          </div>
        ) : null}
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
    </section>
  );
}
