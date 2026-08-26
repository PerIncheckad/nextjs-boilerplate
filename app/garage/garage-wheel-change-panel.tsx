'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './garage-wheel-change.module.css';

type GarageItem = {
  garage_item_id: string;
  regnr: string;
  model: string;
  planned_station: string | null;
  garage_direction: 'IN' | 'UT' | null;
  source_kind: string;
  updated_at: string;
};

type WheelStatus = 'KRAVS' | 'BOKAD' | 'PAGAENDE' | 'KLAR' | 'AVVIKELSE';

type WheelChange = {
  wheel_change_id: string;
  garage_item_id: string;
  regnr: string;
  checkpoint_id: string;
  status: WheelStatus;
  booked_for: string | null;
  supplier: string | null;
  location: string | null;
  note: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

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
  const [garageItems, setGarageItems] = useState<GarageItem[]>([]);
  const [wheelChanges, setWheelChanges] = useState<WheelChange[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selectedGarageItem, setSelectedGarageItem] = useState('');
  const [newNote, setNewNote] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: { garageItems?: GarageItem[]; wheelChanges?: WheelChange[] }) => {
    const nextItems = payload.garageItems ?? [];
    const nextChanges = payload.wheelChanges ?? [];
    setGarageItems(nextItems);
    setWheelChanges(nextChanges);
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

  const activeGarageItemIds = useMemo(
    () => new Set(wheelChanges.filter((item) => item.status !== 'KLAR').map((item) => item.garage_item_id)),
    [wheelChanges],
  );

  const availableItems = useMemo(
    () => garageItems.filter((item) => !activeGarageItemIds.has(item.garage_item_id)),
    [garageItems, activeGarageItemIds],
  );

  const visibleChanges = useMemo(
    () => wheelChanges.filter((item) => showCompleted || item.status !== 'KLAR'),
    [wheelChanges, showCompleted],
  );

  const startWheelChange = async () => {
    if (!selectedGarageItem) return setError('Välj en bil i Garaget.');
    setSavingId('NEW');
    setError(null);
    try {
      const response = await fetch('/api/garage/wheel-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ garage_item_id: selectedGarageItem, note: newNote }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte starta hjulskifte');
      setSelectedGarageItem('');
      setNewNote('');
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
          <div className={styles.eyebrow}>INCHECKAD / GARAGET / L2</div>
          <h2>Hjulskifte</h2>
          <p>Garaget hanterar arbetet. Processmotorn håller kontrollpunkten och Tower visar läget.</p>
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />
          Visa klara
        </label>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.startRow}>
        <label>
          <span>Bil i Garaget</span>
          <select value={selectedGarageItem} onChange={(event) => setSelectedGarageItem(event.target.value)}>
            <option value="">Välj bil</option>
            {availableItems.map((item) => (
              <option key={item.garage_item_id} value={item.garage_item_id}>
                {item.regnr} · {item.model} · {item.planned_station ?? 'station saknas'}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.noteField}>
          <span>Kommentar</span>
          <input value={newNote} onChange={(event) => setNewNote(event.target.value)} placeholder="Valfri startkommentar" />
        </label>
        <button type="button" className={styles.primaryButton} disabled={!selectedGarageItem || savingId === 'NEW'} onClick={() => void startWheelChange()}>
          {savingId === 'NEW' ? 'Startar…' : 'Markera hjulskifte krävs'}
        </button>
        <button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => void load()}>
          {loading ? 'Läser…' : 'Uppdatera'}
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Bil</th>
              <th>Status</th>
              <th>Bokad tid</th>
              <th>Leverantör</th>
              <th>Plats</th>
              <th>Kommentar / avvikelse</th>
              <th>Kontroll</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleChanges.length === 0 ? (
              <tr><td colSpan={8} className={styles.empty}>Inga aktiva hjulskiften.</td></tr>
            ) : visibleChanges.map((item) => {
              const draft = drafts[item.wheel_change_id] ?? makeDraft(item);
              const closed = item.status === 'KLAR';
              return (
                <tr key={item.wheel_change_id} className={item.status === 'AVVIKELSE' ? styles.deviationRow : undefined}>
                  <td><strong>{item.regnr}</strong><span className={styles.subtle}>{garageItems.find((garageItem) => garageItem.garage_item_id === item.garage_item_id)?.model ?? '—'}</span></td>
                  <td>
                    <select value={draft.status} disabled={closed} onChange={(event) => updateDraft(item.wheel_change_id, { status: event.target.value as WheelStatus })}>
                      <option value="KRAVS">Krävs / ej bokad</option>
                      <option value="BOKAD">Bokad</option>
                      <option value="PAGAENDE">Pågående</option>
                      <option value="AVVIKELSE">Avvikelse</option>
                      <option value="KLAR">Klar / verifierad</option>
                    </select>
                  </td>
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
