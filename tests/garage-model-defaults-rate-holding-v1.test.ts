import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260901102000_planning_model_defaults_rate_holding.sql', 'utf8');
const planningApi = readFileSync('app/api/fleet-planning/route.ts', 'utf8');
const modelApi = readFileSync('app/api/planning/models/route.ts', 'utf8');
const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');
const contract = readFileSync('docs/GARAGE_MODEL_DEFAULTS_RATE_HOLDING_2026-09-01.md', 'utf8');

test('model registry owns defaults for both daily rate and holding period', () => {
  assert.match(migration, /planning_vehicle_models[\s\S]*holding_period_months/);
  assert.match(modelApi, /daily_rate/);
  assert.match(modelApi, /holding_period_months/);
  assert.match(planningApi, /daily_rate,holding_period_months/);
});

test('Planering exposes both model defaults as editable masterdata', () => {
  assert.match(planningUi, /holdingPeriodMonths/);
  assert.match(planningUi, />Dygnsdeb<\/th><th[^>]*>Hålltid<\/th>/);
  assert.match(planningUi, /HOLDING_PERIODS = \[4, 6, 9, 12, 18, 24\]/);
  assert.match(planningUi, /holding_period_months: row\.holdingPeriodMonths/);
});

test('atomic Planering to Garage handoff copies both defaults', () => {
  assert.match(migration, /m\.daily_rate/);
  assert.match(migration, /m\.holding_period_months/);
  assert.match(migration, /daily_rate,[\s\S]*holding_period_months,[\s\S]*calloff_at/);
  assert.match(migration, /d\.daily_rate,[\s\S]*d\.holding_period_months/);
});

test('model defaults fill blanks without overwriting vehicle overrides', () => {
  assert.match(migration, /gi\.daily_rate is null/);
  assert.match(migration, /gi\.holding_period_months is null/);
  assert.match(migration, /v_existing_daily_rate is null/);
  assert.match(migration, /v_existing_holding is null/);
  assert.doesNotMatch(migration, /set daily_rate = new\.daily_rate,[\s\S]*where gi\.daily_rate is not null/);
});

test('contract locks equal-model defaults plus manual vehicle override', () => {
  assert.match(contract, /Samma stabila modellidentitet/);
  assert.match(contract, /modellstandard/);
  assert.match(contract, /fordonsunik override/);
  assert.match(contract, /befintlig individuell icke-tom Garage-rad skrivs inte över automatiskt/i);
});
