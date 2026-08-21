export type OperationalKnowledgeState = 'VERIFIED' | 'UNKNOWN';
export type SaleKnowledgeState = 'SOLD' | 'NOT_SOLD' | 'UNKNOWN';

export type OperationalPeriodInput = {
  period_id: string;
  period_type: string;
  started_at: string;
  ended_at: string | null;
  reason_code: string | null;
  reason_text: string | null;
  source_system: string | null;
  source_entity: string | null;
  source_record_id: string | null;
};

export type OperationalEventInput = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  source_system: string | null;
  source_entity: string | null;
  source_record_id: string | null;
  correction_of_event_id?: string | null;
  payload?: unknown;
};

export type OperationalReadModel = {
  knowledgeState: OperationalKnowledgeState;
  currentVerifiedState: string | null;
  stateStartedAt: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  establishedBySource: string | null;
  establishedByEntity: string | null;
  establishedByRecord: string | null;
  lastConfirmedAt: string | null;
  confirmationCount: number;
  latestConfirmationSource: string | null;
  sale: {
    state: SaleKnowledgeState;
    occurredAt: string | null;
    sourceSystem: string | null;
    sourceEntity: string | null;
    sourceRecordId: string | null;
  };
};

function eventPayload(event: OperationalEventInput): Record<string, unknown> | null {
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return null;
  return event.payload as Record<string, unknown>;
}

export function buildOperationalReadModel(
  periods: OperationalPeriodInput[],
  events: OperationalEventInput[],
): OperationalReadModel {
  const openPeriods = periods
    .filter((period) => period.ended_at === null)
    .sort((left, right) => new Date(right.started_at).getTime() - new Date(left.started_at).getTime());

  const current = openPeriods[0] ?? null;

  const confirmations = current
    ? events
        .filter((event) => {
          if (event.event_type !== 'DOWNTIME_CONFIRMED') return false;
          if (current.period_type !== 'DOWNTIME') return false;
          const payload = eventPayload(event);
          const existingPeriodId = typeof payload?.existingPeriodId === 'string' ? payload.existingPeriodId : null;
          return existingPeriodId === current.period_id;
        })
        .sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime())
    : [];

  const latestConfirmation = confirmations[0] ?? null;

  const saleEvents = events
    .filter((event) => event.event_type === 'VEHICLE_SOLD_RECORDED' || event.event_type === 'VEHICLE_SOLD_CORRECTED')
    .sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime());
  const latestSale = saleEvents[0] ?? null;

  return {
    knowledgeState: current ? 'VERIFIED' : 'UNKNOWN',
    currentVerifiedState: current?.period_type ?? null,
    stateStartedAt: current?.started_at ?? null,
    reasonCode: current?.reason_code ?? null,
    reasonText: current?.reason_text ?? null,
    establishedBySource: current?.source_system ?? null,
    establishedByEntity: current?.source_entity ?? null,
    establishedByRecord: current?.source_record_id ?? null,
    lastConfirmedAt: latestConfirmation?.occurred_at ?? null,
    confirmationCount: confirmations.length,
    latestConfirmationSource: latestConfirmation?.source_system ?? null,
    sale: {
      state: latestSale
        ? latestSale.event_type === 'VEHICLE_SOLD_RECORDED' ? 'SOLD' : 'NOT_SOLD'
        : 'UNKNOWN',
      occurredAt: latestSale?.occurred_at ?? null,
      sourceSystem: latestSale?.source_system ?? null,
      sourceEntity: latestSale?.source_entity ?? null,
      sourceRecordId: latestSale?.source_record_id ?? null,
    },
  };
}
