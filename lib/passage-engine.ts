export type PassageRequirementType = 'HANDOFF' | 'CHECKPOINT';

export type PassageBlocker = {
  code: 'HANDOFF_MISSING' | 'HANDOFF_UNRESOLVED' | 'CHECKPOINT_MISSING' | 'CHECKPOINT_UNRESOLVED';
  requirementCode: string;
  referenceCode: string;
  status?: string;
};

export type PassageReadiness = {
  ready: boolean;
  reasons: PassageBlocker[];
};

export function assessPassageReadiness(input: {
  handoffs?: Array<{ requirementCode: string; referenceCode: string; status?: string | null }>;
  checkpoints?: Array<{ requirementCode: string; referenceCode: string; status?: string | null }>;
}): PassageReadiness {
  const reasons: PassageBlocker[] = [];

  for (const handoff of input.handoffs ?? []) {
    if (!handoff.status) {
      reasons.push({
        code: 'HANDOFF_MISSING',
        requirementCode: handoff.requirementCode,
        referenceCode: handoff.referenceCode,
      });
      continue;
    }
    if (handoff.status !== 'VERIFIED' && handoff.status !== 'CANCELLED') {
      reasons.push({
        code: 'HANDOFF_UNRESOLVED',
        requirementCode: handoff.requirementCode,
        referenceCode: handoff.referenceCode,
        status: handoff.status,
      });
    }
  }

  for (const checkpoint of input.checkpoints ?? []) {
    if (!checkpoint.status) {
      reasons.push({
        code: 'CHECKPOINT_MISSING',
        requirementCode: checkpoint.requirementCode,
        referenceCode: checkpoint.referenceCode,
      });
      continue;
    }
    if (checkpoint.status !== 'GODKAND' && checkpoint.status !== 'EJ_RELEVANT') {
      reasons.push({
        code: 'CHECKPOINT_UNRESOLVED',
        requirementCode: checkpoint.requirementCode,
        referenceCode: checkpoint.referenceCode,
        status: checkpoint.status,
      });
    }
  }

  return { ready: reasons.length === 0, reasons };
}
