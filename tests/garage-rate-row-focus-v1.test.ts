import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('app/garage/garage.module.css', 'utf8');
const migration = readFileSync('migrations/20260829143000_garage_model_daily_rate_default.sql', 'utf8');

test('Garage highlights the active row and keeps regnr visible while scrolling', () => {
  assert.match(css, /tbody tr:focus-within td/);
  assert.match(css, /\.regnrColumn,/);
  assert.match(css, /table:not\(:has\(th\.regnrColumn\)\) th:nth-child\(5\)/);
  assert.match(css, /tbody tr:focus-within td\.regnrColumn/);
});

test('UTVECKLA table uses compact width instead of detailed Garage width', () => {
  assert.match(css, /table:has\(th\.regnrColumn\)\{min-width:1280px\}/);
  assert.match(css, /table\{border-collapse:separate;border-spacing:0;min-width:2450px/);
});

test('first Planering daily rate establishes only a missing model default', () => {
  assert.match(migration, /if v_existing_default is not null then\s+return new;/s);
  assert.match(migration, /update public\.planning_vehicle_models[\s\S]*daily_rate = round\(new\.daily_rate\)::integer/);
  assert.match(migration, /gi\.daily_rate is null/);
  assert.match(migration, /fpc\.model_code = v_model_code/);
  assert.doesNotMatch(migration, /set daily_rate = new\.daily_rate[\s\S]*gi\.daily_rate is not null/);
});
