'use client';

import { useEffect, useState } from 'react';

type CheckpointSummary = {
  total: number;
  approved: number;
  waiting: number;
  deviations: number;
  notRelevant: number;
  blocking: number;
  unresolvedBlocking: number;
  verifiedOutcomes: number;
};

type CheckpointDefinition = {
  checkpoint_code: string;
  definition_version: number;
  domain: string;
  title: string;
  description: string | null;
  owner_function: string;
  verification_mode: string;
  blocking: boolean;
};

type CheckpointAssessment = {
  assessment_id: string;
  previous_status: string;
  status: string;
  comment: string | null;
  evidence_refs: unknown[];
  actor_email: string | null;
  actor_source: string;
  assessed_at: string;
};

type CheckpointEvent = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  source_system: string;
  source_entity: string | null;
  source_record_id: string | null;
  actor_source: string;
  actor_name: string | null;
  actor_email: string | null;
};

type GenericCheckpoint = {
  checkpoint_id: string;
  checkpoint_code: string;
  definition_version: number;
  cycle_key: string;
  status: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  definition: CheckpointDefinition | null;
  latestAssessment: CheckpointAssessment | null;
  source: {
    kind: string | null;
    entity: string | null;
    recordId: string | null;
    occurredAt: string | null;
    status: string | null;
    linkedJourneyEvent: CheckpointEvent | null;
  };
  checkpointEvents: {
    created: CheckpointEvent | null;
    assessed: CheckpointEvent | null;
  };
};

type CheckpointReadModelResponse = {
  data?: {
    regnr: string;
    summary: CheckpointSummary;
    checkpoints: GenericCheckpoint[];
  };
  error?: string;
};

type SyncResponse = {
  data?: {
    created?: number;
    assessed?: number;
    unchanged?: number;
  };
  error?: string;
};

type Props = {
  regnr: string;
  refreshNonce: number;
};

const statusLabels: Record<string, string> = {
  GODKAND: 'Godkänd',
  VANTAR: 'Väntar',
  AVVIKELSE: 'Avvikelse',
  EJ_RELEVANT: 'Ej relevant',
};

const domainLabels: Record<string, string> = {
  NYBIL: 'Nybil',
  DRIFT: 'Drift',
  CHECKIN: 'Check-in',
  SERVICE: 'Service',
  SALU: 'SALU',
  PLANERING: 'Planering',
  INKOP: 'Inköp',
  OTHER: 'Övrigt',
};

const sourceLabels: Record<string, string> = {
  nybil_inventering: 'Nybil-registrering',
  checkins: 'Check-in',
  salu_flags: 'SALU-cykel',
};

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('sv-SE');
}

function shortId(value: string | null | undefined) {
  if (!value) return '—';
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function statusStyle(status: string): React.CSSProperties {
  if (status === 'GODKAND') return { background: '#e7f6eb', color: '#165c2e' };
  if (status === 'AVVIKELSE') return { background: '#fde8e7', color: '#8a1f17' };
  if (status === 'VANTAR') return { background: '#fff2db', color: '#704300' };
  return { background: '#eeeeee', color: '#444444' };
}

export default function GenericCheckpointsPanel({ regnr, refreshNonce }: Props) {
  const [data, setData] = useState<CheckpointReadModelResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [localRefreshNonce, setLocalRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/vehicle-checkpoints/read-model?reg=${encodeURIComponent(regnr)}`,
        );
        const body = await response.json() as CheckpointReadModelResponse;
        if (!response.ok || !body.data) {
          throw new Error(body.error || 'Kunde inte hämta kontrollpunkterna');
        }
        if (!cancelled) setData(body.data);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Kunde inte hämta kontrollpunkterna');
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

  async function synchronizeSources() {
    setSyncing(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/vehicle-checkpoints/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ regnr }),
      });
      const body = await response.json() as SyncResponse;
      if (!response.ok) throw new Error(body.error || 'Kunde inte synkronisera kontrollpunkterna');

      const created = body.data?.created ?? 0;
      const assessed = body.data?.assessed ?? 0;
      setMessage(created || assessed
        ? `${created} kontrollpunkter skapades och ${assessed} utfall verifierades.`
        : 'Kontrollpunkterna var redan synkroniserade.');
      setLocalRefreshNonce((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte synkronisera kontrollpunkterna');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{ marginTop: '1.1rem', borderTop: '1px solid #e5e5e5', paddingTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.7rem', alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Kontrollpunkter i fordonsresan</div>
          <div style={{ color: '#666', fontSize: 13, marginTop: '.15rem' }}>
            Generiska kontrollpunkter ovanpå Nybil, Check-in och SALU. SALU:s S00–S28 visas fortsatt separat.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void synchronizeSources()}
          disabled={syncing}
          style={{ border: '1px solid #bbb', borderRadius: 7, background: '#fff', padding: '.45rem .7rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {syncing ? 'Synkroniserar…' : 'Synkronisera källor'}
        </button>
      </div>

      {loading && <p style={{ color: '#666' }}>Hämtar kontrollpunkter…</p>}
      {error && <p style={{ color: '#a00' }}>{error}</p>}
      {message && <p style={{ color: '#165c2e' }}>{message}</p>}

      {!loading && data && (
        <>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.75rem' }}>
            <span style={{ background: '#eee', borderRadius: 999, padding: '.25rem .55rem', fontSize: 12 }}>
              {data.summary.total} totalt
            </span>
            <span style={{ background: '#e7f6eb', borderRadius: 999, padding: '.25rem .55rem', fontSize: 12 }}>
              {data.summary.approved} godkända
            </span>
            <span style={{ background: '#fff2db', borderRadius: 999, padding: '.25rem .55rem', fontSize: 12 }}>
              {data.summary.waiting} väntar
            </span>
            <span style={{ background: '#fde8e7', borderRadius: 999, padding: '.25rem .55rem', fontSize: 12 }}>
              {data.summary.deviations} avvikelser
            </span>
            <span style={{ background: '#eee', borderRadius: 999, padding: '.25rem .55rem', fontSize: 12 }}>
              {data.summary.verifiedOutcomes} verifierade utfall
            </span>
          </div>

          {data.summary.unresolvedBlocking > 0 && (
            <div style={{ background: '#fde8e7', borderRadius: 8, padding: '.65rem .75rem', marginTop: '.7rem' }}>
              {data.summary.unresolvedBlocking} blockerande kontrollpunkter är fortfarande olösta.
            </div>
          )}

          {data.checkpoints.length === 0 ? (
            <div style={{ background: '#f6f6f6', borderRadius: 8, padding: '.7rem .75rem', marginTop: '.7rem', color: '#555' }}>
              Inga generiska kontrollpunkter finns ännu. Nya källhändelser skrivs in automatiskt; äldre Nybil-, Check-in- och SALU-poster kan hämtas med synkroniseringen ovan.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '.65rem', marginTop: '.8rem' }}>
              {data.checkpoints.map((checkpoint) => {
                const definition = checkpoint.definition;
                const assessment = checkpoint.latestAssessment;
                const sourceEvent = checkpoint.source.linkedJourneyEvent
                  ?? checkpoint.checkpointEvents.assessed
                  ?? checkpoint.checkpointEvents.created;
                const blocking = definition?.blocking === true;

                return (
                  <article key={checkpoint.checkpoint_id} style={{ border: '1px solid #e4e4e4', borderRadius: 9, padding: '.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', alignItems: 'start', flexWrap: 'wrap' }}>
                      <div>
                        <strong>{definition?.title ?? checkpoint.checkpoint_code}</strong>
                        <div style={{ color: '#666', fontSize: 12, marginTop: '.15rem' }}>
                          {domainLabels[definition?.domain ?? ''] ?? definition?.domain ?? 'Okänd domän'} · version {checkpoint.definition_version}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                        {blocking && (
                          <span style={{ background: '#fde8e7', borderRadius: 999, padding: '.2rem .5rem', fontSize: 12, fontWeight: 700 }}>
                            Blockerande
                          </span>
                        )}
                        <span style={{ ...statusStyle(checkpoint.status), borderRadius: 999, padding: '.2rem .5rem', fontSize: 12, fontWeight: 700 }}>
                          {statusLabels[checkpoint.status] ?? checkpoint.status}
                        </span>
                      </div>
                    </div>

                    {definition?.description && (
                      <p style={{ margin: '.5rem 0 0', color: '#555', fontSize: 13 }}>{definition.description}</p>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.55rem', marginTop: '.65rem' }}>
                      <div style={{ background: '#f7f7f7', borderRadius: 7, padding: '.55rem' }}>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: '.2rem' }}>Verifierat utfall</div>
                        {assessment ? (
                          <>
                            <strong>{statusLabels[assessment.status] ?? assessment.status}</strong>
                            <div style={{ fontSize: 12, color: '#666', marginTop: '.15rem' }}>
                              {formatDate(assessment.assessed_at)} · {assessment.actor_source}
                              {assessment.actor_email ? ` · ${assessment.actor_email}` : ''}
                            </div>
                            <div style={{ fontSize: 12, color: '#666', marginTop: '.15rem' }}>
                              {assessment.evidence_refs.length} evidensreferenser
                            </div>
                            {assessment.comment && <div style={{ marginTop: '.3rem', fontSize: 13 }}>{assessment.comment}</div>}
                          </>
                        ) : (
                          <span style={{ color: '#666', fontSize: 13 }}>Inget verifierat utfall ännu.</span>
                        )}
                      </div>

                      <div style={{ background: '#f7f7f7', borderRadius: 7, padding: '.55rem' }}>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: '.2rem' }}>Källhändelse</div>
                        <strong>{sourceLabels[checkpoint.source.entity ?? ''] ?? checkpoint.source.entity ?? 'Källa saknas'}</strong>
                        <div style={{ fontSize: 12, color: '#666', marginTop: '.15rem' }}>
                          {formatDate(checkpoint.source.occurredAt ?? sourceEvent?.occurred_at)}
                          {checkpoint.source.status ? ` · ${checkpoint.source.status}` : ''}
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginTop: '.15rem' }}>
                          Källpost: {shortId(checkpoint.source.recordId)}
                        </div>
                        {sourceEvent && (
                          <div style={{ fontSize: 12, color: '#666', marginTop: '.15rem' }}>
                            Fordonsresan: {sourceEvent.event_type} · {shortId(sourceEvent.event_id)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ color: '#777', fontSize: 11, marginTop: '.5rem' }}>
                      Cykel: {checkpoint.cycle_key} · Ägare: {definition?.owner_function ?? '—'} · Verifiering: {definition?.verification_mode ?? '—'}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
