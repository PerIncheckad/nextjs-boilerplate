import test from 'node:test';
import assert from 'node:assert/strict';
import { computeJourneyLifecycleMetrics } from '../lib/vehicle-journey-metrics';

test('journey lifecycle metrics keep primary state time separate from downtime activities', () => {
  const metrics = computeJourneyLifecycleMetrics({
    now: '2026-01-10T00:00:00.000Z',
    lifecycleStartAt: '2026-01-01T00:00:00.000Z',
    lifecycleEndAt: '2026-01-10T00:00:00.000Z',
    saluAt: '2026-01-09T00:00:00.000Z',
    periods: [
      { period_type: 'AVAILABLE', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-02T00:00:00.000Z' },
      { period_type: 'RENTAL', started_at: '2026-01-02T00:00:00.000Z', ended_at: '2026-01-04T00:00:00.000Z' },
      { period_type: 'DOWNTIME', started_at: '2026-01-04T00:00:00.000Z', ended_at: '2026-01-06T00:00:00.000Z', reason_code: 'DAMAGE' },
      { period_type: 'AVAILABLE', started_at: '2026-01-06T00:00:00.000Z', ended_at: '2026-01-07T00:00:00.000Z' },
      { period_type: 'RENTAL', started_at: '2026-01-07T00:00:00.000Z', ended_at: '2026-01-08T00:00:00.000Z' },
    ],
    activities: [
      { activity_type: 'WORKSHOP', started_at: '2026-01-04T12:00:00.000Z', ended_at: '2026-01-05T18:00:00.000Z' },
      { activity_type: 'WAITING_PARTS', started_at: '2026-01-05T00:00:00.000Z', ended_at: '2026-01-05T12:00:00.000Z' },
      { activity_type: 'TRANSPORT', started_at: '2026-01-04T06:00:00.000Z', ended_at: '2026-01-04T08:00:00.000Z' },
    ],
  });

  assert.equal(metrics.lifecycleHours, 216);
  assert.equal(metrics.rentalCount, 2);
  assert.equal(metrics.rentalHours, 72);
  assert.equal(metrics.downtimeHours, 48);
  assert.equal(metrics.workshopHours, 30);
  assert.equal(metrics.waitingPartsHours, 12);
  assert.equal(metrics.transportHours, 2);
  assert.equal(metrics.availableHours, 48);
  assert.equal(metrics.measuredOperationalHours, 168);
  assert.equal(metrics.downtimeHoursByReason.DAMAGE, 48);
  assert.equal(metrics.activityHoursByType.WORKSHOP, 30);
  assert.equal(metrics.firstRentalAt, '2026-01-02T00:00:00.000Z');
  assert.equal(metrics.nybilToFirstRentalHours, 24);
  assert.equal(metrics.lastRentalReturnAt, '2026-01-08T00:00:00.000Z');
  assert.equal(metrics.lastRentalToSaluHours, 24);
  assert.equal(metrics.betweenRentalGapCount, 1);
  assert.equal(metrics.averageHoursBetweenRentals, 72);
  assert.equal(metrics.longestHoursBetweenRentals, 72);
  assert.equal(metrics.overlappingPrimaryPeriods, false);
  assert.equal(metrics.utilizationPct, 42.9);
});

test('journey lifecycle metrics include an open primary period up to now', () => {
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

test('journey lifecycle metrics reject overlapping primary states but allow overlapping activities', () => {
  const primaryOverlap = computeJourneyLifecycleMetrics({
    now: '2026-01-03T00:00:00.000Z',
    periods: [
      { period_type: 'RENTAL', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-02T00:00:00.000Z' },
      { period_type: 'DOWNTIME', started_at: '2026-01-01T12:00:00.000Z', ended_at: '2026-01-02T12:00:00.000Z', reason_code: 'DAMAGE' },
    ],
  });

  assert.equal(primaryOverlap.overlappingPrimaryPeriods, true);
  assert.equal(primaryOverlap.utilizationPct, null);

  const activityOverlap = computeJourneyLifecycleMetrics({
    now: '2026-01-03T00:00:00.000Z',
    periods: [
      { period_type: 'DOWNTIME', started_at: '2026-01-01T00:00:00.000Z', ended_at: '2026-01-02T00:00:00.000Z', reason_code: 'DAMAGE' },
    ],
    activities: [
      { activity_type: 'WORKSHOP', started_at: '2026-01-01T04:00:00.000Z', ended_at: '2026-01-01T20:00:00.000Z' },
      { activity_type: 'WAITING_PARTS', started_at: '2026-01-01T08:00:00.000Z', ended_at: '2026-01-01T12:00:00.000Z' },
    ],
  });

  assert.equal(activityOverlap.overlappingPrimaryPeriods, false);
  assert.equal(activityOverlap.downtimeHours, 24);
  assert.equal(activityOverlap.workshopHours, 16);
  assert.equal(activityOverlap.waitingPartsHours, 4);
  assert.equal(activityOverlap.measuredOperationalHours, 24);
});
