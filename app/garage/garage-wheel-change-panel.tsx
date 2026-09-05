'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './garage-wheel-change.module.css';

type WheelStatus = 'KRAVS' | 'BOKAD' | 'PAGAENDE' | 'KLAR' | 'AVVIKELSE';
type WheelEligibility = 'REQUIRES_CHANGE' | 'ALREADY_CORRECT' | 'SALU_EXEMPT' | 'UNKNOWN_WHEEL_STATUS';
type WheelStorageSource = 'EDIT' | 'NYBIL' | 'VEHICLES' | 'MISSING';

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
  latest_checkin_at: string | null;
  current_city: string | null;
  current_station: string | null;
  current_saludatum: string | null;
  eligibility: WheelEligibility;
};

type WheelStorageFact = {
  regnr: string;
  wheel_storage_location: string | null;
  wheel_storage_source: WheelStorageSource;
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
  KRAVS: 'Behöver skifte',
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

function wheelVerificationLabel(item: WheelCandidate): string {
  return item.latest_checkin_at ? `Check-in ${item.latest_checkin_at.slice(0, 10)}` : 'Nybil-baseline · före första Check-in';
}

function activeStatusOptions(item: WheelChange): WheelStatus[] {
  if (item.status === 'KRAVS') return ['KRAVS', 'BOKAD', 'KLAR', 'AVVIKELSE'];
  if (item.status === 'BOKAD') return ['BOKAD', 'KLAR', 'AVVIKELSE'];
  if (item.status === 'PAGAENDE') return ['PAGAENDE', 'BOKAD', 'KLAR', 'AVVIKELSE'];
  if (item.status === 'AVVIKELSE') return ['AVVIKELSE', 'BOKAD', 'KLAR'];
  return ['KLAR'];
}

export default function GarageWheelChangePanel() {
  const [wheelChanges, setWheelChanges] = useState<WheelChange[]>([]);
  const [candidates, setCandidates] = useState<WheelCandidate[]>([]);
  const [storageByRegnr, setStorageByRegnr] = useState<Record<string, WheelStorageFact>>({});
  const [season, setSeason] = useState<Season | null>(null);
  const [counts, setCounts] = useState<Counts>({ REQUIRES_CHANGE: 0, ALREADY_CORRECT: 0, SALU_EXEMPT: 0, UNKNOWN_WHEEL_STATUS: 0 });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [bookingByRegnr, setBookingByRegnr] = useState<Record<string, string>>({});
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

  const applyStoragePayload = useCallback((payload: { storage?: WheelStorageFact[] }) => {
    setStorageByRegnr(Object.fromEntries((payload.storage ?? []).map((item) => [item.regnr, item])));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wheelResponse, storageResponse] = await Promise.all([
        fetch('/api/garage/wheel-changes', { cache: 'no-store' }),
        fetch('/api/garage/wheel-storage', { cache: 'no-store' }),
      ]);
      const [wheelPayload, storagePayload] = await Promise.all([wheelResponse.json(), storageResponse.json()]);
      if (!wheelResponse.ok) throw new Error(wheelPayload?.error ?? 'Kunde inte läsa hjulskiften');
      if (!storageResponse.ok) throw new Error(storagePayload?.error ?? 'Kunde inte läsa hjulförvaring');
      applyPayload(wheelPayload.data ?? {});
      applyStoragePayload(storagePayload.data ?? {});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa hjulskiften');
    } finally {
      setLoading(false);
    }
  }, [applyPayload, applyStoragePayload]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch('/api/garage/wheel-changes', { cache: 'no-store' }),
      fetch('/api/garage/wheel-storage', { cache: 'no-store' }),
    ])
      .then(async ([wheelResponse, storageResponse]) => {
        const [wheelPayload, storagePayload] = await Promise.all([wheelResponse.json(), storageResponse.json()]);
        if (!wheelResponse.ok) throw new Error(wheelPayload?.error ?? 'Kunde inte läsa hjulskiften');
        if (!storageResponse.ok) throw new Error(storagePayload?.error ?? 'Kunde inte läsa hjulförvaring');
        if (!active) return;
        applyPayload(wheelPayload.data ?? {});
        applyStoragePayload(storagePayload.data ?? {});
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Kunde inte läsa hjulskiften');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyPayload, applyStoragePayload]);

  const openRegnrs = useMemo(
    () => new Set(wheelChanges.filter((item) => item.status !== 'KLAR').map((item) => item.regnr)),
    [wheelChanges],
  );

  const requiresChangeCandidates = useMemo(
    () => candidates.filter((item) => item.eligibility === 'REQUIRES_CHANGE' && !openRegnrs.has(item.regnr)),
    [candidates, openRegnrs],
  );

  const missingStorageCandidates = useMemo(
    () => requiresChangeCandidates.filter((item) => !storageByRegnr[item.regnr]?.wheel_storage_location),
    [requiresChangeCandidates, storageByRegnr],
  );

  const actionableCandidates = useMemo(
    () => requiresChangeCandidates.filter((item) => Boolean(storageByRegnr[item.regnr]?.wheel_storage_location)),
    [requiresChangeCandidates, storageByRegnr],
  );

  const unknownCandidates = useMemo(
    () => candidates.filter((item) => item.eligibility === 'UNKNOWN_WHEEL_STATUS'),
    [candidates],
  );

  const visibleChanges = useMemo(
    () => wheelChanges.filter((item) => showCompleted || item.status !== 'KLAR'),
    [wheelChanges, showCompleted],
  );

  const createShortcut = async (item: WheelCandidate, status: 'BOKAD' | 'KLAR') => {
    const bookedFor = bookingByRegnr[item.regnr] ?? '';
    if (status === 'BOKAD' && !bookedFor) {
      setError(`Välj bokad tid för ${item.regnr}.`);
      return;
    }

    setSavingId(`${status}:${item.regnr}`);
    setError(null);
    try {
      const response = await fetch('/api/garage/wheel-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regnr: item.regnr,
          status,
          booked_for: status === 'BOKAD' ? bookedFor : null,
          location: storageByRegnr[item.regnr]?.wheel_storage_location ?? null,
          note: status === 'KLAR' ? 'Hjulskifte verifierat klart' : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte registrera hjulskifte');
      setBookingByRegnr((current) => {
        const next = { ...current };
        delete next[item.regnr];
        return next;
      });
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kunde inte registrera hjulskifte');
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
          <p>Systemet hittar behovet. Du bokar och bekräftar när arbetet är klart.</p>
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />
          Visa klara
        </label>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.startRow}>
        <strong>{counts.REQUIRES_CHANGE} behöver skifte</strong>
        <span>{missingStorageCandidates.length} saknar hjulförvaring</span>
        <span>{counts.ALREADY_CORRECT} redan rätt</span>
        <span>{counts.SALU_EXEMPT} SALU-undantagna</span>
        <span>{counts.UNKNOWN_WHEEL_STATUS} saknar hjulstatus</span>
        <button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => void load()}>{loading ? 'Läser…' : 'Uppdatera'}</button>
      </div>

      {missingStorageCandidates.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.candidateTable} aria-label="Bilar som saknar hjulförvaring">
            <thead><tr><th>Bil</th><th>Nu på bilen</th><th>Senaste hjulverifiering</th><th>Hjulförvaring</th><th>Åtgärd</th></tr></thead>
            <tbody>{missingStorageCandidates.map((item) => (
              <tr key={`MISSING-STORAGE:${item.regnr}`}>
                <td><strong>{item.regnr}</strong></td>
                <td>{item.current_wheel_type ?? '—'}</td>
                <td>{wheelVerificationLabel(item)}</td>
                <td><strong>Saknas</strong><span className={styles.subtle}>Ange registrerad förvaring i Status.</span></td>
                <td><a className={styles.secondaryButton} href={`/status?reg=${encodeURIComponent(item.regnr)}`}>Ange förvaring</a></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}

      {actionableCandidates.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.candidateTable} aria-label="Bilar redo för hjulskifte">
            <thead><tr><th>Bil</th><th>Nu på bilen</th><th>SALU-datum</th><th>Hjulförvaring</th><th>Bokad tid</th><th>Åtgärd</th></tr></thead>
            <tbody>{actionableCandidates.map((item) => (
              <tr key={item.regnr}>
                <td><strong>{item.regnr}</strong><span className={styles.subtle}>{wheelVerificationLabel(item)}</span></td>
                <td>{item.current_wheel_type ?? '—'}</td>
                <td>{item.current_saludatum ?? '—'}</td>
                <td><strong>{storageByRegnr[item.regnr]?.wheel_storage_location}</strong></td>
                <td><input type="datetime-local" value={bookingByRegnr[item.regnr] ?? ''} disabled={!season?.active} onChange={(event) => setBookingByRegnr((current) => ({ ...current, [item.regnr]: event.target.value }))} /></td>
                <td>
                  <div className={styles.actionButtons}>
                    <button type="button" className={styles.primaryButton} disabled={!season?.active || savingId === `BOKAD:${item.regnr}`} onClick={() => void createShortcut(item, 'BOKAD')}>{savingId === `BOKAD:${item.regnr}` ? 'Bokar…' : 'Boka'}</button>
                    <button type="button" className={styles.secondaryButton} disabled={!season?.active || savingId === `KLAR:${item.regnr}`} onClick={() => void createShortcut(item, 'KLAR')}>{savingId === `KLAR:${item.regnr}` ? 'Sparar…' : 'Redan utfört / Klar'}</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}

      {unknownCandidates.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.candidateTable} aria-label="Bilar med okänd hjulstatus">
            <thead><tr><th>Bil</th><th>Senaste Check-in</th><th>Ort / station</th><th>Bedömning</th><th>Åtgärd</th></tr></thead>
            <tbody>{unknownCandidates.map((item) => (
              <tr key={`UNKNOWN:${item.regnr}`}>
                <td><strong>{item.regnr}</strong></td>
                <td>{item.latest_checkin_at ? item.latest_checkin_at.slice(0, 10) : 'Ingen ännu'}</td>
                <td>{item.current_city ?? '—'}{item.current_station ? ` / ${item.current_station}` : ''}</td>
                <td><strong>{eligibilityLabel(item.eligibility)}</strong><span className={styles.subtle}>Verifiera hjultyp innan Hjulskifte kan avgöras.</span></td>
                <td><a className={styles.secondaryButton} href={`/status?reg=${encodeURIComponent(item.regnr)}`}>Verifiera hjultyp</a></td>
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
                  <td><select value={draft.status} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { status: event.target.value as WheelStatus })}>{activeStatusOptions(item).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></td>
                  <td><input type="datetime-local" value={draft.booked_for} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { booked_for: event.target.value })} /></td>
                  <td><input value={draft.supplier} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { supplier: event.target.value })} placeholder="Leverantör" /></td>
                  <td><input value={draft.location} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { location: event.target.value })} placeholder="Plats" /></td>
                  <td><input value={draft.note} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { note: event.target.value })} placeholder="Kommentar" /></td>
                  <td><strong>{statusLabel(item.status)}</strong><span className={styles.subtle}>L2 · {item.checkpoint_id.slice(0, 8)}</span></td>
                  <td>{closed ? <span className={styles.done}>Verifierad</span> : <button type="button" className={styles.primaryButton} disabled={savingId === item.wheel_change_id} onClick={() => void saveWheelChange(item)}>{savingId === item.wheel_change_id ? 'Sparar…' : draft.status === 'KLAR' ? 'Bekräfta klar' : 'Spara'}</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
