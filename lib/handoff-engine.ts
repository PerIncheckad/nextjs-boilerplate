export const HANDOFF_STATUSES = [
  'REQUESTED',
  'HANDED_OVER',
  'RECEIVED',
  'ACCEPTED',
  'COMPLETED',
  'VERIFIED',
  'CANCELLED',
] as const;

export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export const HANDOFF_VERIFICATION_MODES = [
  'MANUELL',
  'SYSTEM',
  'EVIDENCE_REQUIRED',
] as const;

export type HandoffVerificationMode = (typeof HANDOFF_VERIFICATION_MODES)[number];

export type HandoffDefinition = {
  code: string;
  version: number;
  routineCode: string;
  routineVersion: number;
  fromFunction: string;
  toFunction: string;
  verificationMode: HandoffVerificationMode;
  blocking: boolean;
};

const transitions: Record<Exclude<HandoffStatus, 'VERIFIED' | 'CANCELLED'>, HandoffStatus[]> = {
  REQUESTED: ['HANDED_OVER', 'CANCELLED'],
  HANDED_OVER: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['VERIFIED', 'CANCELLED'],
};

export function isTerminalHandoffStatus(status: HandoffStatus): boolean {
  return status === 'VERIFIED' || status === 'CANCELLED';
}

export function transitionHandoffStatus(
  current: HandoffStatus,
  next: HandoffStatus,
): HandoffStatus {
  if (isTerminalHandoffStatus(current)) {
    throw new Error(`Terminal handoff status ${current} cannot transition`);
  }

  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid handoff transition ${current} -> ${next}`);
  }

  return next;
}

export function validateHandoffVerification(input: {
  mode: HandoffVerificationMode;
  evidenceRefs?: string[];
}): void {
  if (input.mode === 'EVIDENCE_REQUIRED' && (input.evidenceRefs?.length ?? 0) === 0) {
    throw new Error('Verified handoff requires evidence');
  }
}

export function assessHandoffPassage(input: Array<{
  status: HandoffStatus;
  blocking: boolean;
}>): { ready: boolean; reasons: string[] } {
  const unresolvedBlocking = input.filter(
    (handoff) => handoff.blocking && handoff.status !== 'VERIFIED' && handoff.status !== 'CANCELLED',
  );

  return unresolvedBlocking.length === 0
    ? { ready: true, reasons: [] }
    : { ready: false, reasons: ['BLOCKING_HANDOFF_UNRESOLVED'] };
}
