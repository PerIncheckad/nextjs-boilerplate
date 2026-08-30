import { describe, expect, it } from 'vitest';

const allowed = new Set([4, 6, 9, 12, 18, 24]);

function normalizeHoldingPeriod(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && allowed.has(numeric) ? numeric : null;
}

describe('Garage holding period API normalization', () => {
  it.each([4, 6, 9, 12, 18, 24])('accepts %i months', (value) => {
    expect(normalizeHoldingPeriod(value)).toBe(value);
  });

  it.each([0, 3, 5, 7, 10, 15, 20, 36, 365, 'abc'])('rejects unsupported value %s', (value) => {
    expect(normalizeHoldingPeriod(value)).toBeNull();
  });

  it('allows no holding period yet', () => {
    expect(normalizeHoldingPeriod('')).toBeNull();
  });
});
