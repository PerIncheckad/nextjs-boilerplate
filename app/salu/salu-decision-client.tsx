'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './salu.module.css';

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
  blockers: {
    waiting_checkpoints: number;
    open_child_processes: number;
    ready: boolean;
  };
};

const decisions = [
  'SÄLJAS',
  'FÖRLÄNGA',
  'PLANERA VERKSTAD',
  'LÅNGTID PLANERA SKIFTE',
  'ANNAT',
] as const;

type Decision = typeof decisions[number];

export default function SaluDecisionClient() {
  const [rows, setRows] = useState<SaluRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SaluRow | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comment, setComment] = useState('');
  const [newSaludatum, setNewSaludatum] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/salu/decision', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Kunde inte läsa SALU');
      setRows(payload.data ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Kunde inte läsa SALU');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/salu/decision', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Kunde inte läsa SALU');
        return payload.data ?? [];
      })
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((nextError) => {
        if (nextError instanceof DOMException && nextError.name === 'AbortError') return;
        setError(nextError instanceof Error ? nextError.message : 'Kunde inte läsa SALU');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const selectedReady = selected?.blockers.ready ?? false;
  const canSave = useMemo(() => {
    if (!selected || !decision || !selectedReady || saving) return false;
    if (decision === 'FÖRLÄNGA') return Boolean(newSaludatum);
    if (decision === 'ANNAT') return Boolean(comment.trim());
    return true;
  }, [selected, decision, selectedReady, saving, newSaludatum, comment]);

  function choose(row: SaluRow) {
    setSelected(row);
    setDecision(null);
    setComment('');
    setNewSaludatum('');
    setError(null);
  }

  async function saveDecision() {
    if (!selected || !decision || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/salu/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          flag_id: selected.flag_id,
          closure_outcome: decision,
          closure_comment: comment.trim() || null,
          new_saludatum: decision === 'FÖRLÄNGA' ? newSaludatum : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'SALU-beslutet kunde inte sparas');
      setSelected(null);
      setDecision(null);
      setComment('');
      setNewSaludatum('');
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'SALU-beslutet kunde inte sparas');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className={styles.state}>Läser SALU…</section>;

  return (
    <div className={styles.workspace}>
      <section className={styles.listPane}>
        <div className={styles.listHeader}>
          <div>
            <span>AKTIVA</span>
            <strong>{rows.length}</strong>
          </div>
          <button onClick={() => void load()} className={styles.secondaryButton}>Uppdatera</button>
        </div>

        {rows.length === 0 ? (
          <div className={styles.empty}>Inga aktiva SALU-beslut.</div>
        ) : (
          <div className={styles.list}>
            {rows.map((row) => (
              <button
                key={row.flag_id}
                onClick={() => choose(row)}
                className={`${styles.row} ${selected?.flag_id === row.flag_id ? styles.rowSelected : ''}`}
              >
                <span className={styles.regnr}>{row.regnr}</span>
                <span className={styles.date}>{row.current_saludatum}</span>
                <span className={row.blockers.ready ? styles.ready : styles.blocked}>
                  {row.blockers.ready
                    ? 'BESLUT KAN FATTAS'
                    : `${row.blockers.waiting_checkpoints + row.blockers.open_child_processes} BLOCKERARE`}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className={styles.decisionPane}>
        {!selected ? (
          <div className={styles.placeholder}>
            <span>SALU</span>
            <strong>Välj en bil.</strong>
            <p>Du ser bara det som behövs för att kunna fatta ett slutbeslut.</p>
          </div>
        ) : (
          <>
            <div className={styles.vehicleHeader}>
              <div>
                <span className={styles.eyebrow}>BESLUT KRÄVS</span>
                <h2>{selected.regnr}</h2>
              </div>
              <div className={styles.vehicleMeta}>
                <span>Saludatum</span>
                <strong>{selected.current_saludatum}</strong>
              </div>
            </div>

            {!selected.blockers.ready ? (
              <div className={styles.blockerBox}>
                <strong>Kan inte avslutas ännu</strong>
                {selected.blockers.waiting_checkpoints > 0 && (
                  <p>{selected.blockers.waiting_checkpoints} checkpoint(s) väntar.</p>
                )}
                {selected.blockers.open_child_processes > 0 && (
                  <p>{selected.blockers.open_child_processes} barnprocess(er) är inte terminala.</p>
                )}
                <small>När blockerarna är lösta blir slutbeslutet tillgängligt automatiskt.</small>
              </div>
            ) : (
              <>
                <div className={styles.decisionGrid}>
                  {decisions.map((item) => (
                    <button
                      key={item}
                      onClick={() => setDecision(item)}
                      className={`${styles.decisionButton} ${decision === item ? styles.decisionSelected : ''}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                {decision === 'FÖRLÄNGA' && (
                  <label className={styles.field}>
                    <span>Nytt Saludatum</span>
                    <input type="date" value={newSaludatum} onChange={(event) => setNewSaludatum(event.target.value)} />
                  </label>
                )}

                {(decision === 'ANNAT' || decision === 'FÖRLÄNGA') && (
                  <label className={styles.field}>
                    <span>{decision === 'ANNAT' ? 'Orsak / kommentar' : 'Kommentar'}</span>
                    <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} />
                  </label>
                )}

                {decision && (
                  <div className={styles.commitBox}>
                    <div>
                      <span>SLUTBESLUT</span>
                      <strong>{decision}</strong>
                    </div>
                    <button disabled={!canSave} onClick={() => void saveDecision()} className={styles.primaryButton}>
                      {saving ? 'Sparar…' : 'Fatta beslut'}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {error && <div className={styles.error}>{error}</div>}
      </section>
    </div>
  );
}
