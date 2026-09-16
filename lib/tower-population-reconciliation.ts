export type TowerPrimaryState = 'AVAILABLE' | 'RENTAL' | 'DOWNTIME' | 'PREPARATION' | 'SALU' | 'OTHER' | 'UNKNOWN';

type Row = Record<string, unknown>;

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
  }

  const primaryStates = emptyPrimaryStateCounts();
  const outsideActivePrimaryStates = emptyPrimaryStateCounts();
  const positionedIdentityIds = new Set<string>();
  const activeDowntimeRegnrs = new Set<string>();
  const outsideActiveRegnrs = new Set<string>();
  const ambiguousActiveLayer1Regnrs = new Set<string>();
  const duplicateOpenLayer1Regnrs = new Set<string>();
  const seenOpenLayer1Regnrs = new Set<string>();

  for (const row of openPrimaryPeriods) {
    const vehicle = normalizeTowerRegnr(row.regnr);
    if (!vehicle) continue;

    if (seenOpenLayer1Regnrs.has(vehicle)) {
      duplicateOpenLayer1Regnrs.add(vehicle);
      continue;
    }
    seenOpenLayer1Regnrs.add(vehicle);

    const state = primaryState(row.period_type);
    const activeIdentityId = strictActiveRegnrToIdentity.get(vehicle);

    if (activeIdentityId) {
      positionedIdentityIds.add(activeIdentityId);
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
  }

  const workshopRegnrs = new Set<string>();
  for (const row of openActivities) {
    if (row.activity_type !== 'WORKSHOP') continue;
    const vehicle = normalizeTowerRegnr(row.regnr);
    if (vehicle && activeDowntimeRegnrs.has(vehicle)) workshopRegnrs.add(vehicle);
  }

  const positionedActive = positionedIdentityIds.size;

  return {
    active: activeIdentityIds.size,
    positionedActive,
    missingOperationalPosition: Math.max(activeIdentityIds.size - positionedActive, 0),
    primaryStates,
    workshopCaptured: workshopRegnrs.size,
    reconciliation: {
      outsideActivePrimaryStateVehicles: outsideActiveRegnrs.size,
      outsideActivePrimaryStates,
      activeIdentityAliasIssues,
      ambiguousActiveLayer1Vehicles: ambiguousActiveLayer1Regnrs.size,
      duplicateOpenLayer1Vehicles: duplicateOpenLayer1Regnrs.size,
    },
  };
}
