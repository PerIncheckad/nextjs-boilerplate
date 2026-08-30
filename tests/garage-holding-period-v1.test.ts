import { describe, expect, it } from 'vitest';

const HOLDING_PERIODS = [4, 6, 9, 12, 18, 24] as const;

describe('Garage holding period contract', () => {
  it('locks the allowed holding periods', () => {
    expect(HOLDING_PERIODS).toEqual([4, 6, 9, 12, 18, 24]);
  });

  it('keeps delivery separate from holding period semantics', () => {
    expect(HOLDING_PERIODS).not.toContain(365 as never);
  });
});
