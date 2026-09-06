import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260901102000_planning_model_defaults_rate_holding.sql', 'utf8');
const hMigration = readFileSync('migrations/20260906163000_garage_information_continuity_h_v1.sql', 'utf8');
const planningApi = readFileSync('app/api/fleet-planning/route.ts', 'utf8');
const modelApi = readFileSync('app/api/planning/models/route.ts', 'utf8');
const planningUi = readFileSync('app/planning/planning-client.tsx', 'utf8');
const contract = readFileSync('docs/GARAGE_MODEL_DEFAULTS_RATE_HOLDING_2026-09-01.md', 'utf8');

test('model registry remains upstream default source for daily rate and holding period', () => {
  assert.match(migration, /planning_vehicle_models[\s\S]*holding_period_months/);
  assert.match(modelApi, /daily_rate/);
  assert.match(modelApi, /holding_period_months/);
  assert.match(planningApi, /daily_rate,holding_period_months/);
});

test('Planering still exposes both model defaults as editable masterdata', () => {
  assert.match(planningUi, /holdingPeriodMonths/);
  assert.match(planningUi, />Dygnsdeb<\/th><th[^>]*>Hålltid<\/th>/);
  assert.match(planningUi, /HOLDING_PERIODS = \[4, 6, 9, 12, 18, 24\]/);
  assert.match(planningUi, /holding_period_months: row\.holdingPeriodMonths/);
});

test('Planering to Garage handoff still copies both defaults one-way', () => {
  assert.match(hMigration, /m\.daily_rate/);
  assert.match(hMigration, /m\.holding_period_months/);
  assert.match(hMigration, /d\.daily_rate,d\.holding_period_months/);
});

test('Garage daily_rate no longer establishes model default or fans out to sibling rows', () => {
  const hDefaults = hMigration.match(/create or replace function public\.apply_first_garage_model_defaults\(\)[\s\S]*?\n\$\$;/)?.[0] ?? '';
  assert.doesNotMatch(hDefaults, /v_existing_daily_rate/);
  assert.doesNotMatch(hDefaults, /set daily_rate = new\.daily_rate/);
  assert.doesNotMatch(hDefaults, /gi\.daily_rate is null/);
  assert.match(hDefaults, /holding_period_months/);
});

test('historical model-default contract remains documented but H supersedes reverse-write for daily_rate', () => {
  assert.match(contract, /modellstandard/);
  assert.match(contract, /fordonsunik override/);
  assert.match(hMigration, /Garage daily_rate is vehicle-specific current information/);
});
