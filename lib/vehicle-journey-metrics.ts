export type JourneyMetricPeriod = {
  period_type: string;
  started_at: string;
  ended_at: string | null;
  reason_code?: string | null;
};

export type JourneyMetricActivityPeriod = {
  activity_type: string;
  started_at: string;
  ended_at: string | null;
};

export type JourneyLifecycleMetrics = {
  lifecycleStartAt: string | null;
  lifecycleEndAt: string | null;
  lifecycleOngoing: boolean;
  lifecycleHours: number | null;
  rentalCount: number;
  rentalHours: number;
  downtimeHours: number;
  workshopHours: number;
  serviceHours: number;
  waitingPartsHours: number;
  transportHours: number;
  administrationHours: number;
  missingEquipmentHours: number;
  availableHours: number;
  measuredOperationalHours: number;
  utilizationPct: number | null;
  overlappingPrimaryPeriods: boolean;
  downtimeHoursByReason: Record<string, number>;
  activityHoursByType: Record<string, number>;
  firstRentalAt: string | null;
  nybilToFirstRentalHours: number | null;
  lastRentalReturnAt: string | null;
  saluAt: string | null;
  lastRentalToSaluHours: number | null;
  betweenRentalGapCount: number;
  averageHoursBetweenRentals: number | null;
  longestHoursBetweenRentals: number | null;
};

type MetricInput = {
  periods: JourneyMetricPeriod[];
  activities?: JourneyMetricActivityPeriod[];
  lifecycleStartAt?: string | null;
  lifecycleEndAt?: string | null;
  saluAt?: string | null;
  now?: string;
};

const PRIMARY_OPERATIONAL_TYPES = new Set(['AVAILABLE', 'RENTAL', 'DOWNTIME']);

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function roundHours(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function hoursBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  const startMs = parseMs(start);
  const endMs = parseMs(end);
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return roundHours((endMs - startMs) / 3_600_000);
}

function effectivePeriod<T extends { started_at: string; ended_at: string | null }>(period: T, nowMs: number) {
  const startMs = parseMs(period.started_at);
  const endMs = period.ended_at ? parseMs(period.ended_at) : nowMs;
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return {
    ...period,
    startMs,
    endMs,
    hours: roundHours((endMs - startMs) / 3_600_000),
  };
}

function hasOverlap(periods: Array<{ startMs: number; endMs: number }>): boolean {
  const ordered = [...periods].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  let latestEnd = -Infinity;
  for (const period of ordered) {
    if (period.startMs < latestEnd) return true;
    latestEnd = Math.max(latestEnd, period.endMs);
  }
  return false;
}

export function computeJourneyLifecycleMetrics(input: MetricInput): JourneyLifecycleMetrics {
  const now = input.now ?? new Date().toISOString();
  const nowMs = parseMs(now) ?? Date.now();

  const effectivePrimary = input.periods
    .map((period) => effectivePeriod(period, nowMs))
    .filter((period): period is NonNullable<ReturnType<typeof effectivePeriod<JourneyMetricPeriod>>> => period !== null);

  const effectiveActivities = (input.activities ?? [])
    .map((period) => effectivePeriod(period, nowMs))
    .filter((period): period is NonNullable<ReturnType<typeof effectivePeriod<JourneyMetricActivityPeriod>>> => period !== null);

  const hoursByType = effectivePrimary.reduce<Record<string, number>>((totals, period) => {
    totals[period.period_type] = roundHours((totals[period.period_type] ?? 0) + period.hours);
    return totals;
  }, {});

  const activityHoursByType = effectiveActivities.reduce<Record<string, number>>((totals, period) => {
    totals[period.activity_type] = roundHours((totals[period.activity_type] ?? 0) + period.hours);
    return totals;
  }, {});

  const downtimeHoursByReason = effectivePrimary
    .filter((period) => period.period_type === 'DOWNTIME')
    .reduce<Record<string, number>>((totals, period) => {
      const reason = period.reason_code?.trim() || 'UNSPECIFIED';
      totals[reason] = roundHours((totals[reason] ?? 0) + period.hours);
      return totals;
    }, {});

  const rentals = effectivePrimary
    .filter((period) => period.period_type === 'RENTAL')
    .sort((left, right) => left.startMs - right.startMs);

  const rentalHours = hoursByType.RENTAL ?? 0;
  const downtimeHours = hoursByType.DOWNTIME ?? 0;
  const availableHours = hoursByType.AVAILABLE ?? 0;
  const measuredOperationalHours = roundHours(rentalHours + downtimeHours + availableHours);

  const primaryOperationalPeriods = effectivePrimary.filter((period) => PRIMARY_OPERATIONAL_TYPES.has(period.period_type));
  const overlappingPrimaryPeriods = hasOverlap(primaryOperationalPeriods);
  const utilizationPct = measuredOperationalHours > 0 && !overlappingPrimaryPeriods
    ? roundPct((rentalHours / measuredOperationalHours) * 100)
    : null;

  const firstRentalAt = rentals[0]?.started_at ?? null;
  const closedRentalReturns = rentals
    .filter((period) => period.ended_at)
    .sort((left, right) => right.endMs - left.endMs);
  const lastRentalReturnAt = closedRentalReturns[0]?.ended_at ?? null;

  const rentalGaps: number[] = [];
  for (let index = 0; index < rentals.length - 1; index += 1) {
    const current = rentals[index];
    const next = rentals[index + 1];
    if (!current.ended_at || current.endMs > next.startMs) continue;
    rentalGaps.push(roundHours((next.startMs - current.endMs) / 3_600_000));
  }

  const averageHoursBetweenRentals = rentalGaps.length > 0
    ? roundHours(rentalGaps.reduce((total, gap) => total + gap, 0) / rentalGaps.length)
    : null;
  const longestHoursBetweenRentals = rentalGaps.length > 0 ? Math.max(...rentalGaps) : null;

  const lifecycleStartAt = input.lifecycleStartAt ?? null;
  const explicitLifecycleEndAt = input.lifecycleEndAt ?? null;
  const lifecycleEndAt = explicitLifecycleEndAt ?? (lifecycleStartAt ? now : null);

  return {
    lifecycleStartAt,
    lifecycleEndAt,
    lifecycleOngoing: Boolean(lifecycleStartAt && !explicitLifecycleEndAt),
    lifecycleHours: hoursBetween(lifecycleStartAt, lifecycleEndAt),
    rentalCount: rentals.length,
    rentalHours,
    downtimeHours,
    workshopHours: activityHoursByType.WORKSHOP ?? 0,
    serviceHours: activityHoursByType.SERVICE ?? 0,
    waitingPartsHours: activityHoursByType.WAITING_PARTS ?? 0,
    transportHours: activityHoursByType.TRANSPORT ?? 0,
    administrationHours: activityHoursByType.ADMINISTRATION ?? 0,
    missingEquipmentHours: activityHoursByType.MISSING_EQUIPMENT ?? 0,
    availableHours,
    measuredOperationalHours,
    utilizationPct,
    overlappingPrimaryPeriods,
    downtimeHoursByReason,
    activityHoursByType,
    firstRentalAt,
    nybilToFirstRentalHours: hoursBetween(lifecycleStartAt, firstRentalAt),
    lastRentalReturnAt,
    saluAt: input.saluAt ?? null,
    lastRentalToSaluHours: hoursBetween(lastRentalReturnAt, input.saluAt),
    betweenRentalGapCount: rentalGaps.length,
    averageHoursBetweenRentals,
    longestHoursBetweenRentals,
  };
}
