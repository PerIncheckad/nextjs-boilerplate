import assert from 'node:assert/strict';
import test from 'node:test';
import { ET_PRICE_LOCATIONS, assertEtPriceListShape, quoteEtPrice } from '../lib/et-price-list-2026';

test('Staffanstorp is selectable and uses Malmö pricing without losing destination identity', () => {
  assert.ok(ET_PRICE_LOCATIONS.includes('Staffanstorp'));
  assert.doesNotThrow(() => assertEtPriceListShape());

  const malmo = quoteEtPrice({ fromLocation: 'Helsingborg', toLocation: 'Malmö', priceClass: '1.0' });
  const staffanstorp = quoteEtPrice({ fromLocation: 'Helsingborg', toLocation: 'Staffanstorp', priceClass: '1.0' });

  assert.equal(staffanstorp.price, malmo.price);
  assert.equal(staffanstorp.basePrice, malmo.basePrice);
  assert.equal(staffanstorp.toLocation, 'Staffanstorp');
  assert.equal(staffanstorp.priceBasis, 'ET_MATRIX');
});
