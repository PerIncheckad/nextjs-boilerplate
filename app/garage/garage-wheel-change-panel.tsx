'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HUVUDSTATIONER } from '@/lib/constants';
import styles from './garage-wheel-change.module.css';

type WheelStatus = 'KRAVS' | 'BOKAD' | 'PAGAENDE' | 'KLAR' | 'AVVIKELSE';
type WheelEligibility = 'REQUIRES_CHANGE' | 'ALREADY_CORRECT' | 'SALU_EXEMPT' | 'UNKNOWN_WHEEL_STATUS';

type WheelChange = {
  wheel_change_id: string;
  garage_item_id: string | null;
  regnr: string;
  checkpoint_id: string;
  status: WheelStatus;
  season_key: string | null;
  target_wheel_type: string | null;
  booked_for: string | null;
  supplier: string | null;
  location: string | null;
  note: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type WheelCandidate = {
  regnr: string;
  current_wheel_type: string | null;
  latest_checkin_at: string;
  current_city: string | null;
  current_station: string | null;
  current_saludatum: string | null;
  eligibility: WheelEligibility;
};

type Season = {
  type: 'WINTER' | 'SUMMER';
  key: string;
  targetWheelType: 'Vinterdäck' | 'Sommardäck';
  startDate: string;
  endDate: string;
  saluExemptStart: string;
  saluExemptEnd: string;
  active: boolean;
  mode: 'ACTIVE' | 'PREVIEW';
};

type Counts = Record<WheelEligibility, number>;

type Draft = {
  status: WheelStatus;
  booked_for: string;
  supplier: string;
  location: string;
  note: string;
};

const statusLabel = (status: WheelStatus) => ({
  KRAVS: 'Krävs / ej bokad',
  BOKAD: 'Bokad',
  PAGAENDE: 'Pågående',
  KLAR: 'Klar / verifierad',
  AVVIKELSE: 'Avvikelse',
})[status];

const eligibilityLabel = (eligibility: WheelEligibility) => ({
  REQUIRES_CHANGE: 'Hjulskifte krävs',
  ALREADY_CORRECT: 'Rätt hjul sitter på',
  SALU_EXEMPT: 'Undantagen SALU',
  UNKNOWN_WHEEL_STATUS: 'Hjulstatus saknas',
})[eligibility];

const ALLOWED_STATUSES: Record<WheelStatus, WheelStatus[]> = {
  KRAVS: ['KRAVS', 'BOKAD', 'PAGAENDE', 'AVVIKELSE'],
  BOKAD: ['KRAVS', 'BOKAD', 'PAGAENDE', 'AVVIKELSE'],
  PAGAENDE: ['BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE'],
  AVVIKELSE: ['KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE'],
  KLAR: ['KLAR'],
};

const ACTIVE_WHEEL_STATIONS = new Set(['166', '170', '274']);

const allowedStatuses = (status: WheelStatus): WheelStatus[] => ALLOWED_STATUSES[status];

function wheelStationCode(city: string | null): string {
  if (!city) return '—';
  const station = HUVUDSTATIONER.find((item) => item.name.toLocaleLowerCase('sv') === city.toLocaleLowerCase('sv'));
  const code = station ? String(station.id) : '';
  return ACTIVE_WHEEL_STATIONS.has(code) ? code : '—';
}

function localDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function makeDraft(item: WheelChange): Draft {
  return {
    status: item.status,
    booked_for: localDateTime(item.booked_for),
    supplier: item.supplier ?? '',
    location: item.location ?? '',
    note: item.note ?? '',
  };
}

export default function GarageWheelChangePanel() {
  const [wheelChanges, setWheelChanges] = useState<WheelChange[]>([]);
  const [candidates, setCandidates] = useState<WheelCandidate[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [counts, setCounts] = useState<Counts>({ REQUIRES_CHANGE: 0, ALREADY_CORRECT: 0, SALU_EXEMPT: 0, UNKNOWN_WHEEL_STATUS: 0 });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: { wheelChanges?: WheelChange[]; candidates?: WheelCandidate[]; season?: Season; counts?: Counts }) => {
    const nextChanges = payload.wheelChanges ?? [];
    setWheelChanges(nextChanges);
    setCandidates(payload.candidates ?? []);
    setSeason(payload.season ?? null);
    if (payload.counts) setCounts(payload.counts);
    setDrafts(Object.fromEntries(nextChanges.map((item) => [item.wheel_change_id, makeDraft(item)])));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/garage/wheel-changes', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa hjulskiften');
      applyPayload(payload.data ?? {});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa hjulskiften');
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    let active = true;
    void fetch('/api/garage/wheel-changes', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa hjulskiften');
        if (!active) return;
        applyPayload(payload.data ?? {});
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa hjulskiften');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyPayload]);

  const openRegnrs = useMemo(
    () => new Set(wheelChanges.filter((item) => item.status !== 'KLAR').map((item) => item.regnr)),
    [wheelChanges],
  );

  const actionableCandidates = useMemo(
    () => candidates.filter((item) => item.eligibility === 'REQUIRES_CHANGE' && !openRegnrs.has(item.regnr)),
    [candidates, openRegnrs],
  );

  const unknownCandidates = useMemo(
    () => candidates.filter((item) => item.eligibility === 'UNKNOWN_WHEEL_STATUS'),
    [candidates],
  );

  const visibleChanges = useMemo(
    () => wheelChanges.filter((item) => showCompleted || item.status !== 'KLAR'),
    [wheelChanges, showCompleted],
  );

  const startWheelChange = async (regnr: string) => {
    setSavingId(`NEW:${regnr}`);
    setError(null);
    try {
      const response = await fetch('/api/garage/wheel-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regnr }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte starta hjulskifte');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kunde inte starta hjulskifte');
    } finally {
      setSavingId(null);
    }
  };

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const saveWheelChange = async (item: WheelChange) => {
    const draft = drafts[item.wheel_change_id] ?? makeDraft(item);
    if (draft.status === 'BOKAD' && !draft.booked_for) return setError('Bokad tid krävs när status är Bokad.');
    if (draft.status === 'AVVIKELSE' && !draft.note.trim()) return setError('Avvikelse kräver kommentar.');

    setSavingId(item.wheel_change_id);
    setError(null);
    try {
      const response = await fetch('/api/garage/wheel-changes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wheel_change_id: item.wheel_change_id,
          status: draft.status,
          booked_for: draft.booked_for || null,
          supplier: draft.supplier,
          location: draft.location,
          note: draft.note,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte uppdatera hjulskifte');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kunde inte uppdatera hjulskifte');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className={styles.shell} aria-label="Hjulskifte i Garaget">
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>INCHECKAD / GARAGET / HJULSKIFTE</div>
          <h2>Hjulskifte</h2>
          <p>{season ? `${season.type === 'WINTER' ? 'Vinter' : 'Sommar'} · ${season.startDate}–${season.endDate} · mål ${season.targetWheelType}${season.active ? '' : ' · FÖRHANDSVY'}` : 'Läser säsongsregel…'}</p>
          <p>Garaget hanterar arbetet. Processmotorn håller kontrollpunkten och Tower visar läget.</p>
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />
          Visa klara
        </label>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.startRow}>
        <strong>{counts.REQUIRES_CHANGE} behöver skifte</strong>
        <span>{counts.ALREADY_CORRECT} redan rätt</span>
        <span>{counts.SALU_EXEMPT} SALU-undantagna</span>
        <span>{counts.UNKNOWN_WHEEL_STATUS} saknar hjulstatus</span>
        <button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => void load()}>{loading ? 'Läser…' : 'Uppdatera'}</button>
      </div>

      {actionableCandidates.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.candidateTable}>
            <thead><tr><th>Bil</th><th>Nu på bilen</th><th>SALU-datum</th><th>Station</th><th>Bedömning</th>{season?.active ? <th /> : null}</tr></thead>
            <tbody>{actionableCandidates.map((item) => (
              <tr key={item.regnr}>
                <td><strong>{item.regnr}</strong><span className={styles.subtle}>Check-in {item.latest_checkin_at.slice(0, 10)}</span></td>
                <td>{item.current_wheel_type ?? '—'}</td>
                <td>{item.current_saludatum ?? '—'}</td>
                <td><strong>{wheelStationCode(item.current_city)}</strong></td>
                <td><strong>{eligibilityLabel(item.eligibility)}</strong></td>
                {season?.active ? <td><button type="button" className={styles.primaryButton} disabled={savingId === `NEW:${item.regnr}`} onClick={() => void startWheelChange(item.regnr)}>{savingId === `NEW:${item.regnr}` ? 'Startar…' : 'Starta'}</button></td> : null}
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}

      {unknownCandidates.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.candidateTable} aria-label="Bilar med okänd hjulstatus">
            <thead><tr><th>Bil</th><th>Senaste Check-in</th><th>Ort / station</th><th>Bedömning</th></tr></thead>
            <tbody>{unknownCandidates.map((item) => (
              <tr key={`UNKNOWN:${item.regnr}`}>
                <td><strong>{item.regnr}</strong></td>
                <td>{item.latest_checkin_at.slice(0, 10)}</td>
                <td>{item.current_city ?? '—'}{item.current_station ? ` / ${item.current_station}` : ''}</td>
                <td><strong>{eligibilityLabel(item.eligibility)}</strong><span className={styles.subtle}>Verifiera hjultyp innan Hjulskifte kan avgöras.</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.activeTable}>
          <thead>
            <tr><th>Bil</th><th>Säsong</th><th>Status</th><th>Bokad tid</th><th>Leverantör</th><th>Plats</th><th>Kommentar / avvikelse</th><th>Kontroll</th><th /></tr>
          </thead>
          <tbody>
            {visibleChanges.length === 0 ? (
              <tr><td colSpan={9} className={styles.empty}>Inga aktiva hjulskiften.</td></tr>
            ) : visibleChanges.map((item) => {
              const draft = drafts[item.wheel_change_id] ?? makeDraft(item);
              const closed = item.status === 'KLAR';
              return (
                <tr key={item.wheel_change_id} className={item.status === 'AVVIKELSE' ? styles.deviationRow : undefined}>
                  <td><strong>{item.regnr}</strong><span className={styles.subtle}>{item.target_wheel_type ?? 'Legacy'}</span></td>
                  <td>{item.season_key ?? '—'}</td>
                  <td><select value={draft.status} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { status: event.target.value as WheelStatus })}>{allowedStatuses(item.status).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></td>
                  <td><input type="datetime-local" value={draft.booked_for} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { booked_for: event.target.value })} /></td>
                  <td><input value={draft.supplier} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { supplier: event.target.value })} placeholder="Leverantör" /></td>
                  <td><input value={draft.location} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { location: event.target.value })} placeholder="Plats" /></td>
                  <td><input value={draft.note} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { note: event.target.value })} placeholder="Kommentar" /></td>
                  <td><strong>{statusLabel(item.status)}</strong><span className={styles.subtle}>L2 · {item.checkpoint_id.slice(0, 8)}</span></td>
                  <td>{closed ? <span className={styles.done}>Verifierad</span> : <button type="button" className={styles.primaryButton} disabled={savingId === item.wheel_change_id} onClick={() => void saveWheelChange(item)}>{savingId === item.wheel_change_id ? 'Sparar…' : 'Spara'}</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
