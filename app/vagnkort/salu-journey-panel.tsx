'use client';

type VehicleDocument = {
  document_id: string;
  document_type: string;
  title: string | null;
  file_name: string;
  uploaded_at: string;
  salu_flag_id?: string | null;
  salu_checkpoint_id?: string | null;
  salu_child_process_id?: string | null;
};

type Props = {
  state: Record<string, unknown> | null;
  latestFlag: Record<string, unknown> | null;
  checkpoints: Array<Record<string, unknown>>;
  childProcesses: Array<Record<string, unknown>>;
  documents: VehicleDocument[];
};

function text(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function date(value: unknown) {
  if (typeof value !== 'string' || !value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('sv-SE');
}

function statusLabel(value: unknown) {
  const status = typeof value === 'string' ? value : '';
  const labels: Record<string, string> = {
    'GODKÄND': 'Godkänd',
    'AVVIKELSE': 'Avvikelse',
    'EJ RELEVANT': 'Ej relevant',
    'VÄNTAR': 'Väntar',
    'CREATED': 'Skapad',
    'ACCEPTED': 'Accepterad',
    'IN_PROGRESS': 'Pågår',
    'READY_FOR_VERIFICATION': 'Redo för verifiering',
    'VERIFIED': 'Verifierad',
    'CANCELLED': 'Avbruten',
  };
  return labels[status] ?? text(value);
}

function documentCountForCheckpoint(documents: VehicleDocument[], checkpointId: unknown) {
  return typeof checkpointId === 'string'
    ? documents.filter((document) => document.salu_checkpoint_id === checkpointId).length
    : 0;
}

function documentCountForChildProcess(documents: VehicleDocument[], childProcessId: unknown) {
  return typeof childProcessId === 'string'
    ? documents.filter((document) => document.salu_child_process_id === childProcessId).length
    : 0;
}

function differenceDays(original: unknown, current: unknown) {
  if (typeof original !== 'string' || typeof current !== 'string') return null;
  const originalMs = new Date(original).getTime();
  const currentMs = new Date(current).getTime();
  if (!Number.isFinite(originalMs) || !Number.isFinite(currentMs)) return null;
  return Math.round((currentMs - originalMs) / 86_400_000);
}

export default function SaluJourneyPanel({ state, latestFlag, checkpoints, childProcesses, documents }: Props) {
  if (!state && !latestFlag && checkpoints.length === 0 && childProcesses.length === 0) {
    return <p style={{ color: '#666' }}>Ingen aktiv eller historisk SALU-process finns för bilen.</p>;
  }

  const originalDate = state?.original_saludatum;
  const currentDate = state?.current_saludatum ?? latestFlag?.current_saludatum;
  const deltaDays = differenceDays(originalDate, currentDate);
  const deviations = checkpoints.filter((checkpoint) => checkpoint.status === 'AVVIKELSE');
  const waiting = checkpoints.filter((checkpoint) => checkpoint.status === 'VÄNTAR');
  const openActions = childProcesses.filter((process) => !['VERIFIED', 'CANCELLED'].includes(String(process.status ?? '')));
  const flagId = typeof latestFlag?.flag_id === 'string' ? latestFlag.flag_id : null;
  const flagEvidence = flagId
    ? documents.filter((document) => document.salu_flag_id === flagId).length
    : 0;

  return (
    <div style={{ display: 'grid', gap: '.8rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '.55rem' }}>
        <div style={{ border: '1px solid #e6e6e6', borderRadius: 8, padding: '.65rem' }}>
          <div style={{ color: '#666', fontSize: 12 }}>Status</div>
          <strong>{text(latestFlag?.status)}</strong>
        </div>
        <div style={{ border: '1px solid #e6e6e6', borderRadius: 8, padding: '.65rem' }}>
          <div style={{ color: '#666', fontSize: 12 }}>Ursprungligt SALU-datum</div>
          <strong>{text(originalDate)}</strong>
        </div>
        <div style={{ border: '1px solid #e6e6e6', borderRadius: 8, padding: '.65rem' }}>
          <div style={{ color: '#666', fontSize: 12 }}>Aktuellt SALU-datum</div>
          <strong>{text(currentDate)}</strong>
        </div>
        <div style={{ border: '1px solid #e6e6e6', borderRadius: 8, padding: '.65rem' }}>
          <div style={{ color: '#666', fontSize: 12 }}>Förskjutning</div>
          <strong>{deltaDays === null ? '—' : `${deltaDays > 0 ? '+' : ''}${deltaDays} dagar`}</strong>
        </div>
        <div style={{ border: '1px solid #e6e6e6', borderRadius: 8, padding: '.65rem' }}>
          <div style={{ color: '#666', fontSize: 12 }}>Avvikelser</div>
          <strong>{deviations.length}</strong>
        </div>
        <div style={{ border: '1px solid #e6e6e6', borderRadius: 8, padding: '.65rem' }}>
          <div style={{ color: '#666', fontSize: 12 }}>Öppna åtgärder</div>
          <strong>{openActions.length}</strong>
        </div>
      </div>

      {(deviations.length > 0 || waiting.length > 0) && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: '.35rem' }}>Kontrollpunkter som kräver uppmärksamhet</div>
          {[...deviations, ...waiting].map((checkpoint) => {
            const evidenceCount = documentCountForCheckpoint(documents, checkpoint.checkpoint_id);
            return (
              <div key={String(checkpoint.checkpoint_id)} style={{ borderTop: '1px solid #eee', padding: '.55rem 0', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start' }}>
                <div>
                  <strong>{text(checkpoint.checkpoint_code)} · {statusLabel(checkpoint.status)}</strong>
                  <div style={{ fontSize: 13, color: '#666' }}>Senast uppdaterad {date(checkpoint.updated_at)}</div>
                </div>
                <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{evidenceCount} underlag</span>
              </div>
            );
          })}
        </div>
      )}

      {childProcesses.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: '.35rem' }}>Hantering</div>
          {childProcesses.map((process) => {
            const evidenceCount = documentCountForChildProcess(documents, process.child_process_id);
            const hasSourceReason = Boolean(process.source_reason);
            const hasOutcome = Boolean(process.outcome);
            const hasDeadline = Boolean(process.deadline_at);
            return (
              <div key={String(process.child_process_id)} style={{ borderTop: '1px solid #eee', padding: '.55rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <strong>{text(process.process_type)} · {statusLabel(process.status)}</strong>
                  <span style={{ fontSize: 13 }}>{evidenceCount} underlag</span>
                </div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  {process.source_checkpoint ? `Från ${text(process.source_checkpoint)} · ` : ''}
                  Ägare {text(process.owner_ref)} · {text(process.execution_system)}
                </div>
                {(hasSourceReason || hasOutcome || hasDeadline) && (
                  <div style={{ marginTop: '.2rem', fontSize: 13 }}>
                    {hasSourceReason ? <span>{text(process.source_reason)}</span> : null}
                    {hasOutcome ? <span>{hasSourceReason ? ' · ' : ''}{text(process.outcome)}</span> : null}
                    {hasDeadline ? <span>{hasSourceReason || hasOutcome ? ' · ' : ''}Deadline {date(process.deadline_at)}</span> : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ background: '#f6f6f6', borderRadius: 8, padding: '.65rem .75rem', fontSize: 13 }}>
        <strong>Underlag:</strong> {flagEvidence} dokument kopplade till aktuell SALU-flagga. Dokument som är direkt kopplade till checkpoint eller åtgärd visas även på respektive rad.
      </div>
    </div>
  );
}
