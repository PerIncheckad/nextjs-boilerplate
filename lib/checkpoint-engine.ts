export const CHECKPOINT_DOMAINS = [
  'NYBIL',
  'DRIFT',
  'CHECKIN',
  'SERVICE',
  'SALU',
  'PLANERING',
  'INKOP',
  'OTHER',
] as const;

export type CheckpointDomain = (typeof CHECKPOINT_DOMAINS)[number];

export const CHECKPOINT_STATUSES = [
  'VANTAR',
  'GODKAND',
  'AVVIKELSE',
  'EJ_RELEVANT',
] as const;

export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number];

export const CHECKPOINT_VERIFICATION_MODES = [
  'MANUELL',
  'SYSTEM',
  'EVIDENCE_REQUIRED',
] as const;

export type CheckpointVerificationMode = (typeof CHECKPOINT_VERIFICATION_MODES)[number];

export type CheckpointDefinition = {
  code: string;
  version: number;
  domain: CheckpointDomain;
  title: string;
  ownerFunction: string;
  verificationMode: CheckpointVerificationMode;
  blocking: boolean;
};

export type CheckpointAssessmentInput = {
  status: Exclude<CheckpointStatus, 'VANTAR'>;
  comment?: string | null;
  evidenceRefs?: string[];
};

export type CheckpointReadiness = {
  ready: boolean;
  reasons: string[];
};

export function validateCheckpointCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,79}$/.test(normalized)) {
    throw new Error('Invalid checkpoint code');
  }
  return normalized;
}

export function validateCheckpointAssessment(
  input: CheckpointAssessmentInput,
  verificationMode: CheckpointVerificationMode,
): void {
  if (input.status === 'AVVIKELSE' && !input.comment?.trim()) {
    throw new Error('Deviation requires a comment');
  }

  if (
    verificationMode === 'EVIDENCE_REQUIRED' &&
    input.status === 'GODKAND' &&
    (input.evidenceRefs?.length ?? 0) === 0
  ) {
    throw new Error('Approved checkpoint requires evidence');
  }
}

export function assessCheckpointReadiness(
  checkpoints: Array<{ status: CheckpointStatus; blocking: boolean }>,
): CheckpointReadiness {
  const reasons: string[] = [];

  if (checkpoints.some((checkpoint) => checkpoint.blocking && checkpoint.status === 'VANTAR')) {
    reasons.push('BLOCKING_CHECKPOINT_VANTAR');
  }

  if (checkpoints.some((checkpoint) => checkpoint.blocking && checkpoint.status === 'AVVIKELSE')) {
    reasons.push('BLOCKING_CHECKPOINT_AVVIKELSE');
  }

  return { ready: reasons.length === 0, reasons };
}
