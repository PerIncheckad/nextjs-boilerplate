export const PROCESS_TRIGGER_TYPES = [
  'SOURCE_EVENT',
  'SCHEDULED',
  'MANUAL',
  'EXTERNAL',
] as const;

export type ProcessTriggerType = (typeof PROCESS_TRIGGER_TYPES)[number];

export const ROUTINE_ACTIVATION_TYPES = [
  'PROCESS_START',
  'PREVIOUS_ROUTINE',
  'MANUAL',
  'EXTERNAL',
] as const;

export type RoutineActivationType = (typeof ROUTINE_ACTIVATION_TYPES)[number];

export type ProcessDefinition = {
  processCode: string;
  processVersion: number;
  domain: string;
  title: string;
  ownerFunction: string;
  triggerType: ProcessTriggerType;
  triggerConfig: Record<string, unknown>;
};

export type RoutineDefinition = {
  routineCode: string;
  routineVersion: number;
  processCode: string;
  processVersion: number;
  title: string;
  ownerFunction: string;
  sequenceOrder: number;
  activationType: RoutineActivationType;
  activationConfig: Record<string, unknown>;
};

const CONTRACT_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,79}$/;

export function normalizeProcessContractCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!CONTRACT_CODE_RE.test(normalized)) {
    throw new Error('Invalid process contract code');
  }
  return normalized;
}

export function validateProcessDefinition(definition: ProcessDefinition): void {
  normalizeProcessContractCode(definition.processCode);
  normalizeProcessContractCode(definition.domain);

  if (!Number.isInteger(definition.processVersion) || definition.processVersion < 1) {
    throw new Error('Invalid process version');
  }
  if (!definition.title.trim()) throw new Error('Process title is required');
  if (!definition.ownerFunction.trim()) throw new Error('Process owner function is required');
  if (!PROCESS_TRIGGER_TYPES.includes(definition.triggerType)) {
    throw new Error('Invalid process trigger type');
  }
}

export function validateRoutineDefinition(definition: RoutineDefinition): void {
  normalizeProcessContractCode(definition.routineCode);
  normalizeProcessContractCode(definition.processCode);

  if (!Number.isInteger(definition.routineVersion) || definition.routineVersion < 1) {
    throw new Error('Invalid routine version');
  }
  if (!Number.isInteger(definition.processVersion) || definition.processVersion < 1) {
    throw new Error('Invalid process version');
  }
  if (!Number.isInteger(definition.sequenceOrder) || definition.sequenceOrder < 1) {
    throw new Error('Invalid routine sequence order');
  }
  if (!definition.title.trim()) throw new Error('Routine title is required');
  if (!definition.ownerFunction.trim()) throw new Error('Routine owner function is required');
  if (!ROUTINE_ACTIVATION_TYPES.includes(definition.activationType)) {
    throw new Error('Invalid routine activation type');
  }
}
