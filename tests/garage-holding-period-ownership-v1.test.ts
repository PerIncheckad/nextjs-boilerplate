import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260907211500_drop_garage_holding_period_reverse_write_v1.sql', 'utf8');
const defaultsMigration = readFileSync('migrations/20260901102000_planning_model_defaults_rate_holding.sql', 'utf8');
const hMigration = readFileSync('migrations/20260906163000_garage_information_continuity_h_v1.sql', 'utf8');
const garageRoute = readFileSync('app/api/garage/route.ts', 'utf8');

test('migration only removes the Garage reverse-write trigger', () => {
  assert.match(migration, /drop trigger garage_items_first_model_defaults on public\.garage_items;/i);
  assert.doesNotMatch(migration, /drop function/i);
  assert.doesNotMatch(migration, /create or replace function/i);
  assert.doesNotMatch(migration, /\b(update|insert|delete)\b/i);
  assert.doesNotMatch(migration, /alter table/i);
});

test('Planering to Garage holding-period baseline remains canonical', () => {
  assert.match(defaultsMigration, /left join public\.planning_vehicle_models m on m\.model_code = c\.model_code/i);
  assert.match(defaultsMigration, /holding_period_months/i);
  assert.match(defaultsMigration, /insert into public\.garage_items\([\s\S]*holding_period_months/i);
  assert.match(defaultsMigration, /d\.holding_period_months/i);
  assert.match(defaultsMigration, /create trigger planning_vehicle_models_propagate_defaults[\s\S]*after update of daily_rate, holding_period_months/i);
  assert.match(defaultsMigration, /execute function public\.propagate_planning_model_defaults_to_blank_garage_rows\(\)/i);
});

test('Garage can still update the exact episode holding period', () => {
  assert.match(garageRoute, /Object\.hasOwn\(body, 'holding_period_months'\)/);
  assert.match(garageRoute, /admin\.from\('garage_items'\)\.update\(\{ \.\.\.normalized, updated_at: now, updated_by: verification\.user\.id \}\)\.eq\('garage_item_id', id\)/);
});

test('Garage holding-period edit no longer has an active reverse-write or sibling fan-out trigger', () => {
  assert.doesNotMatch(migration, /create trigger garage_items_first_model_defaults/i);
  assert.doesNotMatch(migration, /planning_vehicle_models/i);
  assert.doesNotMatch(migration, /set holding_period_months/i);
});

test('episode override remains allowed and H fields stay untouched', () => {
  assert.match(defaultsMigration, /Individual Garage rows may override it/i);
  assert.match(hMigration, /Garage current return\/SALU address/i);
  assert.doesNotMatch(migration, /daily_rate|planned_delivery_date|returadress|regnr|garage_information_events/i);
});
