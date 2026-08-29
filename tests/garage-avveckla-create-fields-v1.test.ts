import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('app/garage/garage-client.tsx', 'utf8');

test('manual create shows detailed AVVECKLA fields only for UT', () => {
  assert.match(source, /draft\.garage_direction === 'UT' \? <>/);
  for (const label of ['VIN', 'Källreg', 'Orsak', 'Order', 'Beställd', 'Bekräftelse', 'Transport']) {
    assert.match(source, new RegExp(`Field label="${label}"`));
  }
});

test('switching manual create to IN clears hidden AVVECKLA values', () => {
  assert.match(source, /const changeDraftDirection = \(next: GarageDirection \| null\) =>/);
  assert.match(source, /next === 'IN'/);
  assert.match(source, /vin: ''/);
  assert.match(source, /source_regnr: ''/);
  assert.match(source, /planning_reason: 'ANNAT'/);
  assert.match(source, /order_reference: ''/);
  assert.match(source, /ordered_at: ''/);
  assert.match(source, /confirmation_status: 'PLANERAD'/);
  assert.match(source, /transport_status: 'EJ_BOKAD'/);
});
