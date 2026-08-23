export type SourceTriggerAdapterDefinition = {
  adapterCode: string;
  adapterVersion: number;
  sourceLayer: 'LAYER1';
  sourceSystem: string;
  sourceEntity: string;
  sourceEventType: string;
  processCode: string;
  processVersion: number;
  routineCode?: string | null;
  routineVersion?: number | null;
  active: boolean;
};

export type Layer1JourneyEvent = {
  eventId: string;
  regnr: string;
  eventType: string;
  sourceSystem: string;
  sourceEntity?: string | null;
};

export function matchesSourceTriggerAdapter(
  definition: SourceTriggerAdapterDefinition,
  event: Layer1JourneyEvent,
): boolean {
  if (!definition.active) return false;

  const sourceEntity = event.sourceEntity ?? 'vehicle_journey_events';

  return (
    definition.sourceLayer === 'LAYER1' &&
    definition.sourceSystem === event.sourceSystem &&
    definition.sourceEntity === sourceEntity &&
    definition.sourceEventType === event.eventType
  );
}

export function validateSourceTriggerAdapter(
  definition: SourceTriggerAdapterDefinition,
): void {
  const hasRoutineCode = Boolean(definition.routineCode);
  const hasRoutineVersion = definition.routineVersion != null;

  if (hasRoutineCode !== hasRoutineVersion) {
    throw new Error('Routine code and version must be configured together');
  }

  if (definition.adapterVersion <= 0 || definition.processVersion <= 0) {
    throw new Error('Adapter and process versions must be positive');
  }
}
