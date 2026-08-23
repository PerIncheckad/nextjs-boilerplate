export const MANDATE_CAPABILITIES = [
  'HANDOFF_HAND_OVER',
  'HANDOFF_RECEIVE',
  'HANDOFF_ACCEPT',
  'HANDOFF_COMPLETE',
  'HANDOFF_VERIFY',
  'HANDOFF_CANCEL',
  'CHECKPOINT_ASSESS',
  'ACTION_ACCEPT',
  'ACTION_PROGRESS',
  'ACTION_VERIFY',
] as const;

export type MandateCapability = (typeof MANDATE_CAPABILITIES)[number];

export const MANDATE_SCOPE_TYPES = [
  'GLOBAL',
  'PROCESS',
  'ROUTINE',
  'HANDOFF',
  'CHECKPOINT',
] as const;

export type MandateScopeType = (typeof MANDATE_SCOPE_TYPES)[number];

export type MandateGrant = {
  employeeId: string;
  functionCode: string;
  capabilityCode: MandateCapability;
  scopeType: MandateScopeType;
  scopeCode?: string | null;
  active: boolean;
  validFrom: Date;
  validUntil?: Date | null;
  revokedAt?: Date | null;
};

export function isMandateActive(grant: MandateGrant, at = new Date()): boolean {
  if (!grant.active || grant.revokedAt) return false;
  if (grant.validFrom.getTime() > at.getTime()) return false;
  if (grant.validUntil && grant.validUntil.getTime() <= at.getTime()) return false;
  return true;
}

export function scopeMatches(
  grant: Pick<MandateGrant, 'scopeType' | 'scopeCode'>,
  requiredType: MandateScopeType,
  requiredCode?: string | null,
): boolean {
  if (grant.scopeType === 'GLOBAL') return true;
  return (
    grant.scopeType === requiredType &&
    (grant.scopeCode ?? '').toUpperCase() === (requiredCode ?? '').toUpperCase()
  );
}

export function handoffCapabilityForStatus(status: string): MandateCapability {
  switch (status) {
    case 'HANDED_OVER': return 'HANDOFF_HAND_OVER';
    case 'RECEIVED': return 'HANDOFF_RECEIVE';
    case 'ACCEPTED': return 'HANDOFF_ACCEPT';
    case 'COMPLETED': return 'HANDOFF_COMPLETE';
    case 'VERIFIED': return 'HANDOFF_VERIFY';
    case 'CANCELLED': return 'HANDOFF_CANCEL';
    default: throw new Error(`No mandate capability for handoff status ${status}`);
  }
}
