export type TowerPrimaryState = 'AVAILABLE' | 'RENTAL' | 'DOWNTIME' | 'PREPARATION' | 'SALU' | 'OTHER' | 'UNKNOWN';

type Row = Record<string, unknown>;

export type TowerFleetDrilldownRow = Readonly<{
  identityId: string;
  regnr: string | null;
  operationalPosition: 'VERIFIED' | 'MISSING';
  primaryState: TowerPrimaryState | null;
  startedAt: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  sourceSystem: string | null;
  sourceEntity: string | null;
  sourceRecordId: string | null;
  activityType: string | null;
  activityStartedAt: string | null;
}>;

export type TowerExternalLayer1DrilldownRow = Readonly<{
  regnr: string;
  primaryState: TowerPrimaryState;
  startedAt: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  sourceSystem: string | null;
  sourceEntity: string | null;
  sourceRecordId: string | null;
}>;

const PRIMARY_STATES: TowerPrimaryState[] = [
  'AVAILABLE',
  'RENTAL',
  'DOWNTIME',
  'PREPARATION',
  'SALU',
  'OTHER',
  'UNKNOWN',
];

function emptyPrimaryStateCounts(): Record<TowerPrimaryState, number> {
  return {
    AVAILABLE: 0,
    RENTAL: 0,
    DOWNTIME: 0,
    PREPARATION: 0,
    SALU: 0,
    OTHER: 0,
    UNKNOWN: 0,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeTowerRegnr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/\s+/g, '').trim();
  return normalized || null;
}

function primaryState(value: unknown): TowerPrimaryState {
  if (typeof value === 'string' && PRIMARY_STATES.includes(value as TowerPrimaryState)) {
    return value as TowerPrimaryState;
  }
  return 'OTHER';
}

export function reconcileTowerPopulation({
  activeMembershipRows,
  regnrAliasRows,
  openPrimaryPeriods,
  openActivities,
}: {
  activeMembershipRows: Row[];
  regnrAliasRows: Row[];
  openPrimaryPeriods: Row[];
  openActivities: Row[];
}) {
  const activeIdentityIds = new Set<string>();
  for (const row of activeMembershipRows) {
    if (typeof row.identity_id === 'string' && row.identity_id) activeIdentityIds.add(row.identity_id);
  }

  const aliasesByIdentity = new Map<string, Set<string>>();
  const activeIdentityIdsByRegnr = new Map<string, Set<string>>();

  for (const row of regnrAliasRows) {
    const identityId = typeof row.identity_id === 'string' ? row.identity_id : null;
    const alias = normalizeTowerRegnr(row.alias_value);
    if (!identityId || !alias || !activeIdentityIds.has(identityId)) continue;

    const aliases = aliasesByIdentity.get(identityId) ?? new Set<string>();
    aliases.add(alias);
    aliasesByIdentity.set(identityId, aliases);

    const identities = activeIdentityIdsByRegnr.get(alias) ?? new Set<string>();
    identities.add(identityId);
    activeIdentityIdsByRegnr.set(alias, identities);
  }

  const strictActiveRegnrToIdentity = new Map<string, string>();
  const strictRegnrByIdentity = new Map<string, string>();
  let activeIdentityAliasIssues = 0;

  for (const identityId of activeIdentityIds) {
    const aliases = aliasesByIdentity.get(identityId) ?? new Set<string>();
    if (aliases.size !== 1) {
      activeIdentityAliasIssues += 1;
      continue;
    }

    const alias = aliases.values().next().value as string | undefined;
    if (!alias || (activeIdentityIdsByRegnr.get(alias)?.size ?? 0) !== 1) {
      activeIdentityAliasIssues += 1;
      continue;
    }

    strictActiveRegnrToIdentity.set(alias, identityId);
    strictRegnrByIdentity.set(identityId, alias);
  }

  const periodsByRegnr = new Map<string, Row[]>();
  for (const row of openPrimaryPeriods) {
    const vehicle = normalizeTowerRegnr(row.regnr);
    if (!vehicle) continue;
    const rows = periodsByRegnr.get(vehicle) ?? [];
    rows.push(row);
    periodsByRegnr.set(vehicle, rows);
  }

  const primaryStates = emptyPrimaryStateCounts();
  const outsideActivePrimaryStates = emptyPrimaryStateCounts();
  const positionedIdentityIds = new Set<string>();
  const activeDowntimeRegnrs = new Set<string>();
  const outsideActiveRegnrs = new Set<string>();
  const ambiguousActiveLayer1Regnrs = new Set<string>();
  const duplicateOpenLayer1Regnrs = new Set<string>();
  const periodByPositionedIdentity = new Map<string, Row>();
  const externalRows: TowerExternalLayer1DrilldownRow[] = [];

  for (const [vehicle, rows] of periodsByRegnr) {
    if (rows.length !== 1) {
      duplicateOpenLayer1Regnrs.add(vehicle);
      continue;
    }

    const period = rows[0];
    const state = primaryState(period?.period_type);
    const activeIdentityId = strictActiveRegnrToIdentity.get(vehicle);

    if (activeIdentityId) {
      positionedIdentityIds.add(activeIdentityId);
      periodByPositionedIdentity.set(activeIdentityId, period);
      primaryStates[state] += 1;
      if (state === 'DOWNTIME') activeDowntimeRegnrs.add(vehicle);
      continue;
    }

    if (activeIdentityIdsByRegnr.has(vehicle)) {
      ambiguousActiveLayer1Regnrs.add(vehicle);
      continue;
    }

    outsideActiveRegnrs.add(vehicle);
    outsideActivePrimaryStates[state] += 1;
    externalRows.push({
      regnr: vehicle,
      primaryState: state,
      startedAt: stringValue(period.started_at),
      reasonCode: stringValue(period.reason_code),
      reasonText: stringValue(period.reason_text),
      sourceSystem: stringValue(period.source_system),
      sourceEntity: stringValue(period.source_entity),
      sourceRecordId: stringValue(period.source_record_id),
    });
  }

  const workshopActivityByRegnr = new Map<string, Row>();
  for (const row of openActivities) {
    if (row.activity_type !== 'WORKSHOP') continue;
    const vehicle = normalizeTowerRegnr(row.regnr);
    if (vehicle && activeDowntimeRegnrs.has(vehicle)) workshopActivityByRegnr.set(vehicle, row);
  }

  const activeRows: TowerFleetDrilldownRow[] = [...activeIdentityIds]
    .sort((a, b) => a.localeCompare(b))
    .map((identityId) => {
      const regnr = strictRegnrByIdentity.get(identityId) ?? null;
      const period = periodByPositionedIdentity.get(identityId);
      const state = period ? primaryState(period.period_type) : null;
      const activity = regnr && state === 'DOWNTIME' ? workshopActivityByRegnr.get(regnr) : undefined;
      return {
        identityId,
        regnr,
        operationalPosition: period ? 'VERIFIED' : 'MISSING',
        primaryState: state,
        startedAt: period ? stringValue(period.started_at) : null,
        reasonCode: period ? stringValue(period.reason_code) : null,
        reasonText: period ? stringValue(period.reason_text) : null,
        sourceSystem: period ? stringValue(period.source_system) : null,
        sourceEntity: period ? stringValue(period.source_entity) : null,
        sourceRecordId: period ? stringValue(period.source_record_id) : null,
        activityType: activity ? stringValue(activity.activity_type) : null,
        activityStartedAt: activity ? stringValue(activity.started_at) : null,
      };
    });

  const positionedRows = activeRows.filter((row) => row.operationalPosition === 'VERIFIED');
  const missingRows = activeRows.filter((row) => row.operationalPosition === 'MISSING');
  const primaryStateRows = PRIMARY_STATES.reduce<Record<TowerPrimaryState, TowerFleetDrilldownRow[]>>((acc, state) => {
    acc[state] = positionedRows.filter((row) => row.primaryState === state);
    return acc;
  }, {
    AVAILABLE: [],
    RENTAL: [],
    DOWNTIME: [],
    PREPARATION: [],
    SALU: [],
    OTHER: [],
    UNKNOWN: [],
  });

  externalRows.sort((a, b) => a.regnr.localeCompare(b.regnr));

  const positionedActive = positionedRows.length;

  return {
    active: activeRows.length,
    positionedActive,
    missingOperationalPosition: missingRows.length,
    primaryStates,
    workshopCaptured: workshopActivityByRegnr.size,
    reconciliation: {
      outsideActivePrimaryStateVehicles: outsideActiveRegnrs.size,
      outsideActivePrimaryStates,
      activeIdentityAliasIssues,
      ambiguousActiveLayer1Vehicles: ambiguousActiveLayer1Regnrs.size,
      duplicateOpenLayer1Vehicles: duplicateOpenLayer1Regnrs.size,
    },
    populations: {
      active: activeRows,
      positioned: positionedRows,
      missingOperationalPosition: missingRows,
      primaryStates: primaryStateRows,
      externalLayer1: externalRows,
    },
  };
}
