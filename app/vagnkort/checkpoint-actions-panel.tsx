'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type CheckpointOption = {
  checkpoint_id: string;
  checkpoint_code: string;
  status: string;
  definition: {
    title: string;
    domain: string;
  } | null;
};

type ActionEvent = {
  action_event_id: string;
  event_type: string;
  previous_status: string | null;
  status: string;
  comment: string | null;
  actor_email: string | null;
  actor_source: string;
  occurred_at: string;
};

type CheckpointAction = {
  action_id: string;
  checkpoint_id: string;
  title: string;
  description: string | null;
  owner_function: string;
  owner_ref: string | null;
  deadline_at: string;
  blocking: boolean;
  status: string;
  outcome: string | null;
  outcome_comment: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_for_verification_at: string | null;
  verified_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  overdue: boolean;
  checkpoint: {
    checkpoint_id: string;
    checkpoint_code: string;
    status: string;
    definition: {
      title: string;
      domain: string;
    } | null;
  } | null;
  events: ActionEvent[];
};

type ActionReadModel = {
  regnr: string;
  summary: {
    total: number;
    open: number;
    overdue: number;
    blockingOpen: number;
    readyForVerification: number;
    verified: number;
    cancelled: number;
  };
  actions: CheckpointAction[];
};

type Props = {
  regnr: string;
  checkpoints: CheckpointOption[];
  refreshNonce: number;
  onChanged?: () => void;
};

const actionStatusLabels: Record<string, string> = {
  CREATED: 'Skapad',
  ACCEPTED: 'Accepterad',
  IN_PROGRESS: 'Pågår',
  READY_FOR_VERIFICATION: 'Klar för verifiering',
  VERIFIED: 'Verifierad',
  CANCELLED: 'Avbruten',
};

const outcomeLabels: Record<string, string> = {
  ATGARDAD: 'Åtgärdad',
  ACCEPTERAD_AVVIKELSE: 'Accepterad avvikelse',
  EJ_RELEVANT: 'Ej relevant',
  FORTSATT_AVVIKELSE: 'Fortsatt avvikelse',
};

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('sv-SE');
}

function statusStyle(status: string): React.CSSProperties {
  if (status === 'VERIFIED') return { background: '#e7f6eb', color: '#165c2e' };
  if (status === 'CANCELLED') return { background: '#eeeeee', color: '#555555' };
  if (status === 'READY_FOR_VERIFICATION') return { background: '#e8f0ff', color: '#244d93' };
  return { background: '#fff2db', color: '#704300' };
}

function defaultDeadline() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export default function CheckpointActionsPanel({
  regnr,
  checkpoints,
  refreshNonce,
  onChanged,
}: Props) {
  const [data, setData] = useState<ActionReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [localRefreshNonce, setLocalRefreshNonce] = useState(0);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const deviations = useMemo(
    () => checkpoints.filter((checkpoint) => checkpoint.status === 'AVVIKELSE'),
    [checkpoints],
  );

  const [checkpointId, setCheckpointId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ownerFunction, setOwnerFunction] = useState('BILKONTROLL');
  const [ownerRef, setOwnerRef] = useState('');
  const [deadlineAt, setDeadlineAt] = useState(defaultDeadline);
  const [blocking, setBlocking] = useState(true);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});

  const selectedCheckpointId = deviations.some(
    (checkpoint) => checkpoint.checkpoint_id === checkpointId,
  )
    ? checkpointId
    : deviations[0]?.checkpoint_id ?? '';

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/checkpoint-actions/read-model?reg=${encodeURIComponent(regnr)}`,
        );
        const body = await response.json() as { data?: ActionReadModel; error?: string };
        if (!response.ok || !body.data) {
          throw new Error(body.error || 'Kunde inte hämta åtgärderna');
        }
        if (!cancelled) setData(body.data);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Kunde inte hämta åtgärderna');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError('');
      void load();
    });

    return () => { cancelled = true; };
  }, [regnr, refreshNonce, localRefreshNonce]);

  function refresh(text?: string) {
    if (text) setMessage(text);
    setLocalRefreshNonce((value) => value + 1);
    onChanged?.();
  }

  async function post(payload: Record<string, unknown>) {
    const response = await fetch('/api/checkpoint-actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ regnr, ...payload }),
    });
    const body = await response.json() as { data?: unknown; error?: string };
    if (!response.ok) throw new Error(body.error || 'Åtgärden misslyckades');
    return body.data;
  }

  async function createAction(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError('');
    setMessage('');

    try {
      await post({
        action: 'CREATE',
        checkpointId: selectedCheckpointId,
        title,
        description,
        ownerFunction,
        ownerRef,
        deadlineAt,
        blocking,
      });
      setTitle('');
      setDescription('');
      setOwnerRef('');
      setDeadlineAt(defaultDeadline());
      refresh('Åtgärden skapades och lades i fordonsresan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skapa åtgärden');
    } finally {
      setCreating(false);
    }
  }

  async function transitionAction(actionId: string, nextStatus: string) {
    setBusyActionId(actionId);
    setError('');
    setMessage('');

    try {
      await post({
        action: 'TRANSITION',
        actionId,
        nextStatus,
        comment: comments[actionId] ?? '',
      });
      setComments((current) => ({ ...current, [actionId]: '' }));
      refresh('Åtgärdens status uppdaterades.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte uppdatera åtgärden');
    } finally {
      setBusyActionId(null);
    }
  }

  async function verifyAction(actionId: string) {
    setBusyActionId(actionId);
    setError('');
    setMessage('');

    try {
      const evidenceRefs = (evidence[actionId] ?? '')
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);

      await post({
        action: 'VERIFY',
        actionId,
        outcome: outcomes[actionId] ?? 'ATGARDAD',
        comment: comments[actionId] ?? '',
        evidenceRefs,
      });
      setComments((current) => ({ ...current, [actionId]: '' }));
      setEvidence((current) => ({ ...current, [actionId]: '' }));
      refresh('Ny verifiering registrerades och kontrollpunkten uppdaterades.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte verifiera åtgärden');
    } finally {
      setBusyActionId(null);
    }
  }

  const summary = data?.summary;

  return (
    <div style={{ marginTop: '1rem', borderTop: '1px solid #e5e5e5', paddingTop: '1rem' }}>
      <div>
        <div style={{ fontWeight: 700 }}>Åtgärder och ny verifiering</div>
        <div style={{ color: '#666', fontSize: 13, marginTop: '.15rem' }}>
          En avvikelse får ansvar, deadline och utförande. Åtgärden avslutas först efter en separat verifiering.
        </div>
      </div>

      {summary && (
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.7rem' }}>
          <span style={{ background: '#eee', borderRadius: 999, padding: '.25rem .55rem', fontSize: 12 }}>{summary.total} totalt</span>
          <span style={{ background: '#fff2db', borderRadius: 999, padding: '.25rem .55rem', fontSize: 12 }}>{summary.open} öppna</span>
          <span style={{ background: '#fde8e7', borderRadius: 999, padding: '.25rem .55rem', fontSize: 12 }}>{summary.overdue} försenade</span>
          <span style={{ background: '#fde8e7', borderRadius: 999, padding: '.25rem .55rem', fontSize: 12 }}>{summary.blockingOpen} blockerande</span>
          <span style={{ background: '#e8f0ff', borderRadius: 999, padding: '.25rem .55rem', fontSize: 12 }}>{summary.readyForVerification} för verifiering</span>
        </div>
      )}

      {error && <p style={{ color: '#a00' }}>{error}</p>}
      {message && <p style={{ color: '#165c2e' }}>{message}</p>}

      {deviations.length > 0 && (
        <form onSubmit={createAction} style={{ marginTop: '.8rem', background: '#f7f7f7', borderRadius: 9, padding: '.75rem', display: 'grid', gap: '.55rem' }}>
          <strong>Skapa åtgärd för avvikelse</strong>
          <select value={selectedCheckpointId} onChange={(event) => setCheckpointId(event.target.value)} required style={{ padding: '.55rem', borderRadius: 7, border: '1px solid #bbb' }}>
            {deviations.map((checkpoint) => (
              <option key={checkpoint.checkpoint_id} value={checkpoint.checkpoint_id}>
                {checkpoint.definition?.title ?? checkpoint.checkpoint_code}
              </option>
            ))}
          </select>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Vad ska åtgärdas?" maxLength={200} style={{ padding: '.55rem', borderRadius: 7, border: '1px solid #bbb' }} />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Beskrivning" maxLength={1000} rows={2} style={{ padding: '.55rem', borderRadius: 7, border: '1px solid #bbb' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.55rem' }}>
            <input value={ownerFunction} onChange={(event) => setOwnerFunction(event.target.value)} required placeholder="Ansvarig funktion" maxLength={120} style={{ padding: '.55rem', borderRadius: 7, border: '1px solid #bbb' }} />
            <input value={ownerRef} onChange={(event) => setOwnerRef(event.target.value)} placeholder="Ansvarig person/referens" maxLength={200} style={{ padding: '.55rem', borderRadius: 7, border: '1px solid #bbb' }} />
            <input type="datetime-local" value={deadlineAt} onChange={(event) => setDeadlineAt(event.target.value)} required style={{ padding: '.55rem', borderRadius: 7, border: '1px solid #bbb' }} />
          </div>
          <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={blocking} onChange={(event) => setBlocking(event.target.checked)} />
            Blockerar nästa steg tills åtgärden är verifierad
          </label>
          <button type="submit" disabled={creating} style={{ justifySelf: 'start', border: 0, borderRadius: 7, background: '#111', color: '#fff', padding: '.55rem .8rem', fontWeight: 700 }}>
            {creating ? 'Skapar…' : 'Skapa åtgärd'}
          </button>
        </form>
      )}

      {loading && <p style={{ color: '#666' }}>Hämtar åtgärder…</p>}
      {!loading && data?.actions.length === 0 && (
        <div style={{ marginTop: '.7rem', background: '#f6f6f6', borderRadius: 8, padding: '.7rem .75rem', color: '#555' }}>
          Inga generiska åtgärder ännu.
        </div>
      )}

      {!loading && data && data.actions.length > 0 && (
        <div style={{ display: 'grid', gap: '.65rem', marginTop: '.8rem' }}>
          {data.actions.map((action) => {
            const busy = busyActionId === action.action_id;
            const terminal = action.status === 'VERIFIED' || action.status === 'CANCELLED';

            return (
              <article key={action.action_id} style={{ border: action.overdue ? '1px solid #d33' : '1px solid #e4e4e4', borderRadius: 9, padding: '.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '.6rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{action.title}</strong>
                    <div style={{ color: '#666', fontSize: 12, marginTop: '.15rem' }}>
                      {action.checkpoint?.definition?.title ?? action.checkpoint?.checkpoint_code ?? 'Kontrollpunkt'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                    {action.blocking && <span style={{ background: '#fde8e7', borderRadius: 999, padding: '.2rem .5rem', fontSize: 12, fontWeight: 700 }}>Blockerande</span>}
                    {action.overdue && <span style={{ background: '#fde8e7', color: '#8a1f17', borderRadius: 999, padding: '.2rem .5rem', fontSize: 12, fontWeight: 700 }}>Försenad</span>}
                    <span style={{ ...statusStyle(action.status), borderRadius: 999, padding: '.2rem .5rem', fontSize: 12, fontWeight: 700 }}>{actionStatusLabels[action.status] ?? action.status}</span>
                  </div>
                </div>

                {action.description && <p style={{ margin: '.5rem 0 0', color: '#555', fontSize: 13 }}>{action.description}</p>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.45rem', marginTop: '.6rem', fontSize: 13 }}>
                  <div><strong>Ansvar:</strong> {action.owner_function}{action.owner_ref ? ` · ${action.owner_ref}` : ''}</div>
                  <div><strong>Deadline:</strong> {formatDate(action.deadline_at)}</div>
                  <div><strong>Utfall:</strong> {action.outcome ? outcomeLabels[action.outcome] ?? action.outcome : '—'}</div>
                </div>

                {!terminal && (
                  <div style={{ display: 'grid', gap: '.45rem', marginTop: '.65rem' }}>
                    <input value={comments[action.action_id] ?? ''} onChange={(event) => setComments((current) => ({ ...current, [action.action_id]: event.target.value }))} placeholder="Kommentar / avbrottsorsak" maxLength={1000} style={{ padding: '.5rem', borderRadius: 7, border: '1px solid #bbb' }} />
                    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                      {action.status === 'CREATED' && <button type="button" disabled={busy} onClick={() => void transitionAction(action.action_id, 'ACCEPTED')}>Acceptera</button>}
                      {action.status === 'ACCEPTED' && <button type="button" disabled={busy} onClick={() => void transitionAction(action.action_id, 'IN_PROGRESS')}>Starta</button>}
                      {action.status === 'IN_PROGRESS' && <button type="button" disabled={busy} onClick={() => void transitionAction(action.action_id, 'READY_FOR_VERIFICATION')}>Klar för verifiering</button>}
                      {action.status === 'READY_FOR_VERIFICATION' && <button type="button" disabled={busy} onClick={() => void transitionAction(action.action_id, 'IN_PROGRESS')}>Tillbaka till pågår</button>}
                      <button type="button" disabled={busy} onClick={() => void transitionAction(action.action_id, 'CANCELLED')}>Avbryt</button>
                    </div>
                  </div>
                )}

                {action.status === 'READY_FOR_VERIFICATION' && (
                  <div style={{ marginTop: '.65rem', background: '#eef3ff', borderRadius: 8, padding: '.65rem', display: 'grid', gap: '.45rem' }}>
                    <strong>Ny verifiering</strong>
                    <select value={outcomes[action.action_id] ?? 'ATGARDAD'} onChange={(event) => setOutcomes((current) => ({ ...current, [action.action_id]: event.target.value }))} style={{ padding: '.5rem', borderRadius: 7, border: '1px solid #bbb' }}>
                      {Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <textarea value={evidence[action.action_id] ?? ''} onChange={(event) => setEvidence((current) => ({ ...current, [action.action_id]: event.target.value }))} placeholder="Evidensreferenser, en per rad" rows={2} style={{ padding: '.5rem', borderRadius: 7, border: '1px solid #bbb' }} />
                    <button type="button" disabled={busy} onClick={() => void verifyAction(action.action_id)} style={{ justifySelf: 'start', border: 0, borderRadius: 7, background: '#244d93', color: '#fff', padding: '.5rem .75rem', fontWeight: 700 }}>
                      {busy ? 'Verifierar…' : 'Verifiera utfall'}
                    </button>
                  </div>
                )}

                {action.events.length > 0 && (
                  <details style={{ marginTop: '.6rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: '#666' }}>Historik ({action.events.length})</summary>
                    {action.events.slice(0, 5).map((event) => (
                      <div key={event.action_event_id} style={{ borderTop: '1px solid #eee', padding: '.35rem 0', fontSize: 12 }}>
                        <strong>{event.event_type}</strong> · {actionStatusLabels[event.status] ?? event.status} · {formatDate(event.occurred_at)}
                        {event.actor_email ? ` · ${event.actor_email}` : ''}
                        {event.comment && <div>{event.comment}</div>}
                      </div>
                    ))}
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
