'use client';

import { useEffect, useState } from 'react';
import styles from './garage.module.css';

type GarageItem = {
  garage_item_id: string;
  planning_period: string | null;
  model: string;
  regnr: string | null;
  planned_station: string | null;
  source_kind: 'MANUELL' | 'PLANERING' | 'SALU' | 'LAGER1';
  source_planning_unit_no: number | null;
  void_allowed?: boolean;
  void_block_reason?: string | null;
};

function sourceLabel(item: GarageItem) {
  if (item.source_kind === 'PLANERING') return `Planering #${item.source_planning_unit_no ?? '—'}`;
  if (item.source_kind === 'SALU') return 'SALU';
  if (item.source_kind === 'LAGER1') return 'Lager 1';
  return 'Manuell';
}

async function loadItems(): Promise<GarageItem[]> {
  const response = await fetch('/api/garage', { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa Garaget');

  const items = (payload.data ?? []) as GarageItem[];
  return Promise.all(items.map(async (item) => {
    const capabilityResponse = await fetch(
      `/api/garage/void?garage_item_id=${encodeURIComponent(item.garage_item_id)}`,
      { cache: 'no-store' },
    );
    const capabilityPayload = await capabilityResponse.json();
    if (!capabilityResponse.ok) {
      throw new Error(capabilityPayload?.error ?? 'Kunde inte verifiera makuleringsrätt');
    }
    return {
      ...item,
      void_allowed: capabilityPayload?.data?.void_allowed === true,
      void_block_reason: capabilityPayload?.data?.void_block_reason ?? null,
    };
  }));
}

export default function GarageVoidPanel() {
  const [items, setItems] = useState<GarageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadItems()
      .then((nextItems) => {
        if (active) {
          setItems(nextItems);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Kunde inte läsa Garaget');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const refresh = async () => {
    setItems(await loadItems());
  };

  const voidItem = async (item: GarageItem) => {
    if (item.void_allowed !== true) {
      setError(item.void_block_reason ?? 'Garage-objektet kan inte makuleras');
      return;
    }

    const label = item.regnr || item.model;
    const reason = window.prompt(`Varför ska ${label} tas bort från aktiva Garaget?`);
    if (!reason?.trim()) return;
    if (!window.confirm(`Makulera ${label} i Garaget? Källan och historiken sparas.`)) return;

    setBusyId(item.garage_item_id);
    setError(null);
    try {
      const response = await fetch('/api/garage/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ garage_item_id: item.garage_item_id, reason: reason.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte makulera Garage-objektet');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kunde inte makulera Garage-objektet');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={styles.createPanel} aria-label="Makulera Garage-objekt">
      <div className={styles.panelTitle}>
        <h2>Ta bort från aktiva Garaget</h2>
        <span>Makulering tar bort objektet ur den aktiva arbetsytan men lämnar källan och audit-historiken intakta.</span>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      {loading ? <div className={styles.empty}>Läser Garage-objekt…</div> : (
        <div className={styles.sourceList}>
          {items.map((item) => (
            <div className={styles.sourceRow} key={item.garage_item_id}>
              <strong>{item.regnr || 'Ej reg.nr'}</strong>
              <span>{item.model}</span>
              <span>{item.planned_station ?? '—'}</span>
              <span>{sourceLabel(item)}</span>
              {item.void_allowed === true ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={busyId === item.garage_item_id}
                  onClick={() => void voidItem(item)}
                >
                  {busyId === item.garage_item_id ? 'Makulering…' : 'Ta bort'}
                </button>
              ) : (
                <span title={item.void_block_reason ?? undefined}>Låst</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}