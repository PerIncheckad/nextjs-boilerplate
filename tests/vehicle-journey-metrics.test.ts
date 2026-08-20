import test from 'node:test';
import assert from 'node:assert/strict';
import { computeJourneyLifecycleMetrics } from '../lib/vehicle-journey-metrics';

test('journey lifecycle metrics summarize rental, downtime and workshop time', () => {
  const metrics = computeJourneyLifecycleMetrics({
    now: '2026-01-10T00:00:00.000Z',
    lifecycleStartAt: '2026-01-01T00:00:00.000Z',
    lifecycleEndAt: '2026-01-10T00:00:00.000Z',
    saluAt: '2026-01-09T00:00:00.000Z',
    periods: [
      { period_type: 'AVAILABLE', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-02T00:00:00.000Z' },
      { period_type: 'RENTAL', started_at: '2026-01-02T00:00:00.000Z', ended_at: '2026-01-04T00:00:00.000Z' },
      { period_type: 'DOWNTIME', started_at: '2026-01-04T00:00:00.000Z', ended_at: '2026-01-05T00:00:00.000Z', reason_code: 'DAMAGE' },
      { period_type: 'WORKSHOP', started_at: '2026-01-05T00:00:00.000Z', ended_at: '2026-01-06T00:00:00.000Z' },
      { period_type: 'RENTAL', started_at: '2026-01-07T00:00:00.000Z', ended_at: '2026-01-08T00:00:00.000Z' },
    ],
  });

  assert.equal(metrics.lifecycleHours, 216);
  assert.equal(metrics.rentalCount, 2);
  assert.equal(metrics.rentalHours, 72);
  assert.equal(metrics.downtimeHours, 24);
  assert.equal(metrics.workshopHours, 24);
  assert.equal(metrics.availableHours, 24);
  assert.equal(metrics.downtimeHoursByReason.DAMAGE, 24);
  assert.equal(metrics.firstRentalAt, '2026-01-02T00:00:00.000Z');
  assert.equal(metrics.nybilToFirstRentalHours, 24);
  assert.equal(metrics.lastRentalReturnAt, '2026-01-08T00:00:00.000Z');
  assert.equal(metrics.lastRentalToSaluHours, 24);
  assert.equal(metrics.betweenRentalGapCount, 1);
  assert.equal(metrics.averageHoursBetweenRentals, 72);
  assert.equal(metrics.longestHoursBetweenRentals, 72);
  assert.equal(metrics.overlappingOperationalPeriods, false);
  assert.equal(metrics.utilizationPct, 50);
});

test('journey lifecycle metrics include an open period up to now', () => {
  const metrics = computeJourneyLifecycleMetrics({
    now: '2026-01-03T00:00:00.000Z',
    lifecycleStartAt: '2026-01-01T00:00:00.000Z',
    periods: [
      { period_type: 'RENTAL', started_at: '2026-01-02T00:00:00.000Z', ended_at: null },
    ],
  });

  assert.equal(metrics.lifecycleOngoing, true);
  assert.equal(metrics.lifecycleHours, 48);
  assert.equal(metrics.rentalHours, 24);
  assert.equal(metrics.rentalCount, 1);
});

test('journey lifecycle metrics avoid misleading utilization when periods overlap', () => {
  const metrics = computeJourneyLifecycleMetrics({
    now: '2026-01-03T00:00:00.000Z',
    periods: [
      { period_type: 'RENTAL', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-02T00:00:00.000Z' },
      { period_type: 'DOWNTIME', started_at: '2026-01-01T12:00:00.000Z', ended_at: '2026-01-02T12:00:00.000Z', reason_code: 'WORKSHOP' },
    ],
  });

  assert.equal(metrics.overlappingOperationalPeriods, true);
  assert.equal(metrics.utilizationPct, null);
});
