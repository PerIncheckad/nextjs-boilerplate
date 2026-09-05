import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260906011000_hjulskifte_completed_current_wheel_fact.sql'),
  'utf8',
);
const statusRoute = readFileSync(
  join(process.cwd(), 'app/api/status-data/route.ts'),
  'utf8',
);
const statusClient = readFileSync(
  join(process.cwd(), 'lib/status-data-client.ts'),
  'utf8',
);
const statusSource = readFileSync(
  join(process.cwd(), 'lib/status-read-model-source.ts'),
  'utf8',
);

test('verified KLAR Hjulskifte is a timestamped source of current wheel truth', () => {
  assert.match(migration, /create or replace function public\.get_current_wheel_fact\(p_regnr text\)/i);
  assert.match(migration, /w\.status = 'KLAR'/);
  assert.match(migration, /w\.completed_at is not null/);
  assert.match(migration, /w\.target_wheel_type in \('Vinterdäck', 'Sommardäck'\)/);
  assert.match(migration, /w\.completed_at as verified_at/);
  assert.match(migration, /'HJULSKIFTE'::text as source_system/);
  assert.match(migration, /'garage_wheel_changes'::text as source_entity/);
  assert.match(migration, /w\.wheel_change_id::text as source_record_id/);
});

test('current wheel truth is latest verified fact, not a fixed legacy precedence', () => {
  assert.match(migration, /from public\.garage_wheel_changes w/);
  assert.match(migration, /from public\.vehicle_edits e/);
  assert.match(migration, /from public\.checkins c/);
  assert.match(migration, /from public\.nybil_inventering ny/);
  assert.match(migration, /order by s\.verified_at desc nulls last, s\.source_rank desc/);
});

test('wheel-change candidate source consumes the common current-wheel read model', () => {
  assert.match(migration, /left join lateral public\.get_current_wheel_fact\(u\.regnr\) f on true/);
  assert.match(migration, /f\.wheel_type as current_wheel_type/);
});

test('Status read boundary exposes wheel fact with provenance without rewriting source history', () => {
  assert.match(statusRoute, /admin\.rpc\('get_current_wheel_fact', \{ p_regnr: regnr \}\)/);
  assert.match(statusRoute, /currentWheelFact/);
  assert.match(statusClient, /currentWheelFact: unknown \| null/);
  assert.match(statusSource, /currentWheelFact: StatusRow \| null/);
  assert.match(statusSource, /requireOptionalRow\(payload\.currentWheelFact, 'currentWheelFact'\)/);
});

test('read-model migration does not mutate protected business domains or old wheel sources', () => {
  assert.doesNotMatch(migration, /insert\s+into\s+public\.(vehicle_journey_periods|rental_operational_facts|salu_flags|salu_vehicle_state|garage_avveckla_cases|vehicle_external_intakes|vehicle_legacy_current_state_entries)/i);
  assert.doesNotMatch(migration, /update\s+public\.(checkins|nybil_inventering|vehicle_edits|vehicle_journey_periods|rental_operational_facts|salu_flags|salu_vehicle_state)/i);
  assert.doesNotMatch(migration, /delete\s+from/i);
});
