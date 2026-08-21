import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const api = readFileSync(join(process.cwd(), 'app/api/vehicle-journey-periods/route.ts'), 'utf8');
const manager = readFileSync(join(process.cwd(), 'app/vagnkort/period-manager.tsx'), 'utf8');
const client = readFileSync(join(process.cwd(), 'app/vagnkort/vagnkort-client.tsx'), 'utf8');
const migration = readFileSync(join(process.cwd(), 'migrations/20260821091800_enforce_one_open_vehicle_journey_period_type.sql'), 'utf8');

test('journey period writes stay authenticated and server controlled', () => {
  assert.match(api, /verifyApiUser\(request\)/);
  assert.match(api, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(api, /vehicleExists/);
  assert.match(api, /PERIOD_STARTED/);
  assert.match(api, /PERIOD_ENDED/);
  assert.match(api, /created_by:\s*verification\.user\.id/);
});

test('journey period API validates vehicle, period type and period ownership', () => {
  assert.match(api, /Invalid regnr/);
  assert.match(api, /Invalid period type/);
  assert.match(api, /Period not found for vehicle/);
  assert.match(api, /End time cannot be before start time/);
  assert.match(api, /An open period of this type already exists/);
});

test('only one open period per vehicle and type is enforced in the database', () => {
  assert.match(migration, /unique index/i);
  assert.match(migration, /\(regnr, period_type\)/);
  assert.match(migration, /where ended_at is null/i);
});

test('Vagnkort can start and end journey periods', () => {
  assert.match(client, /<PeriodManager/);
  assert.match(manager, /Starta period/);
  assert.match(manager, /Avsluta period/);
  assert.match(manager, /action:\s*'start'/);
  assert.match(manager, /action:\s*'end'/);
  assert.match(manager, /Stillestånd/);
  assert.match(manager, /Verkstad/);
  assert.match(manager, /Uthyrd/);
});
