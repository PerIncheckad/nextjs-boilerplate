import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('app/garage/garage-client.tsx', 'utf8');

test('manual UT create keeps only Garage staging fields', () => {
  assert.match(source, /draft\.garage_direction === 'UT' \? <>/);
  for (const label of ['VIN', 'Källreg', 'Orsak', 'Saluort']) assert.match(source, new RegExp(`Field label="${label}"`));
  for (const label of ['Order', 'Beställd', 'Avropad', 'Bekräftelse', 'Transport']) assert.doesNotMatch(source, new RegExp(`Field label="${label}"`));
});

test('manual IN create exposes only current information complements', () => {
  assert.match(source, /draft\.garage_direction === 'IN' \? <>/);
  for (const label of ['Returadress', 'Förväntad ankomst', 'Hålltid']) assert.match(source, new RegExp(`Field label="${label}"`));
  assert.match(source, /Field label="Reg\.nr"/);
  assert.match(source, /Field label="Dygnsdeb"/);
});
