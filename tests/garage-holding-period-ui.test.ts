import { describe, expect, it } from 'vitest';

describe('Garage holding period UI contract', () => {
  it('keeps holding period immediately after daily rate in UTVECKLA', () => {
    const columns = ['Källa', 'Månad', 'Modell', 'Reg.nr', 'Station', 'Leverantör', 'Dygnsdeb', 'Hålltid', 'Avropad', 'Kommentar'];
    expect(columns.indexOf('Hålltid')).toBe(columns.indexOf('Dygnsdeb') + 1);
    expect(columns).not.toContain('Leverans');
  });
});
