import { saluEscalationStatus, type SaluEscalationStatus } from './salu-core';

export type SaluFlagStatus = 'NY' | 'HANDLÄGGS' | 'VÄNTAR' | 'SLUTBEDÖMNING' | 'STÄNGD';
export type SaluCheckpointStatus = 'GODKÄND' | 'AVVIKELSE' | 'EJ RELEVANT' | 'VÄNTAR';
export type SaluChildStatus =
  | 'CREATED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'READY_FOR_VERIFICATION'
  | 'VERIFIED'
  | 'CANCELLED';

export type SaluFlagSnapshot = {
  flagId: string;
  regnr: string;
  previousFlagId?: string | null;
  cycleSaludatum: string;
  currentSaludatum: string;
  status: SaluFlagStatus;
  escalationStatus: SaluEscalationStatus;
};

export type SaluCloseReadiness = {
  ready: boolean;
  reasons: string[];
};

export const SALU_EVENTS = [
  'SALU_FLAG_CREATED',
  'SALU_FLAG_ACKNOWLEDGED',
  'SALU_ASSESSMENT_RECORDED',
  'SALU_CHECKPOINT_CHANGED',
  'SALU_INLINE_ACTION_CREATED',
  'SALU_CHILD_PROCESS_CREATED',
  'SALU_CHILD_STATUS_REPORTED',
  'SALU_SALUDATUM_CHANGED',
  'SALU_SOLD_RECORDED',
  'SALU_HANDOVER_RECORDED',
  'SALU_T10_ESCALATED',
  'SALU_T0_PASSED',
  'SALU_FLAG_READY_FOR_OWNER_DECISION',
  'SALU_FLAG_CLOSED_MANUALLY',
] as const;

export type SaluEventType = (typeof SALU_EVENTS)[number];

export function isTerminalChildStatus(status: SaluChildStatus): boolean {
  return status === 'VERIFIED' || status === 'CANCELLED';
}

export function transitionSaluChildStatus(
  current: SaluChildStatus,
  next: SaluChildStatus,
): SaluChildStatus {
  if (current === next) {
    return current;
  }

  if (isTerminalChildStatus(current)) {
    throw new Error(`Terminal SALU child status ${current} cannot transition`);
  }

  if (next === 'CANCELLED') {
    return next;
  }

  const allowed: Record<Exclude<SaluChildStatus, 'VERIFIED' | 'CANCELLED'>, SaluChildStatus[]> = {
    CREATED: ['ACCEPTED'],
    ACCEPTED: ['IN_PROGRESS'],
    IN_PROGRESS: ['READY_FOR_VERIFICATION'],
    READY_FOR_VERIFICATION: ['VERIFIED', 'IN_PROGRESS'],
  };

  if (!allowed[current].includes(next)) {
    throw new Error(`Invalid SALU child transition ${current} -> ${next}`);
  }

  return next;
}

export function assessSaluCloseReadiness(input: {
  checkpointStatuses: SaluCheckpointStatus[];
  childStatuses: SaluChildStatus[];
}): SaluCloseReadiness {
  const reasons: string[] = [];

  if (input.checkpointStatuses.some((status) => status === 'VÄNTAR')) {
    reasons.push('CHECKPOINT_VÄNTAR');
  }

  if (input.childStatuses.some((status) => !isTerminalChildStatus(status))) {
    reasons.push('CHILD_PROCESS_NOT_TERMINAL');
  }

  return { ready: reasons.length === 0, reasons };
}

export function acknowledgeSaluFlag(snapshot: SaluFlagSnapshot): SaluFlagSnapshot {
  if (snapshot.status !== 'NY') {
    throw new Error('Only a NY SALU flag can be acknowledged');
  }

  return { ...snapshot, status: 'HANDLÄGGS' };
}

export function moveSaluFlagToFinalAssessment(
  snapshot: SaluFlagSnapshot,
  readiness: SaluCloseReadiness,
): SaluFlagSnapshot {
  if (!readiness.ready) {
    throw new Error('SALU flag is not ready for final assessment');
  }

  if (snapshot.status !== 'HANDLÄGGS' && snapshot.status !== 'VÄNTAR') {
    throw new Error('Final assessment requires HANDLÄGGS or VÄNTAR');
  }

  return { ...snapshot, status: 'SLUTBEDÖMNING' };
}

export function closeSaluFlagManually(
  snapshot: SaluFlagSnapshot,
  readiness: SaluCloseReadiness,
): SaluFlagSnapshot {
  if (snapshot.status !== 'SLUTBEDÖMNING') {
    throw new Error('Manual closure requires SLUTBEDÖMNING');
  }

  if (!readiness.ready) {
    throw new Error('SALU flag cannot close while blocking conditions remain');
  }

  return { ...snapshot, status: 'STÄNGD' };
}

export function applyActiveSaludatumChange(input: {
  snapshot: SaluFlagSnapshot;
  newSaludatum: string;
  today: string;
}): SaluFlagSnapshot {
  if (input.snapshot.status === 'STÄNGD') {
    throw new Error('A closed SALU flag must not be mutated by an active-plan date change');
  }

  return {
    ...input.snapshot,
    currentSaludatum: input.newSaludatum,
    escalationStatus: saluEscalationStatus(input.today, input.newSaludatum),
  };
}

export function createReopenedSaluFlag(input: {
  previous: SaluFlagSnapshot;
  newFlagId: string;
  today: string;
}): SaluFlagSnapshot {
  if (input.previous.status !== 'STÄNGD') {
    throw new Error('SALU can only be reopened from a closed flag');
  }

  return {
    flagId: input.newFlagId,
    regnr: input.previous.regnr,
    previousFlagId: input.previous.flagId,
    cycleSaludatum: input.previous.currentSaludatum,
    currentSaludatum: input.previous.currentSaludatum,
    status: 'NY',
    escalationStatus: saluEscalationStatus(input.today, input.previous.currentSaludatum),
  };
}
