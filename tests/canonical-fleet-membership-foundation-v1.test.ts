import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync(
  'migrations/20260911235900_create_canonical_fleet_membership_v1_foundation.sql',
  'utf8',
);

test('foundation scope is canonical OWN_FLEET membership only', () => {
  assert.match(migration, /identity_scope text not null default 'OWN_FLEET'/);
  assert.match(migration, /membership_state in \('ACTIVE', 'INACTIVE', 'UNKNOWN'\)/);
  assert.match(migration, /basis in \('CURRENT_BASELINE', 'ENTRY', 'EXIT', 'CORRECTION'\)/);
  assert.doesNotMatch(migration, /nybil_inventering|garage_avveckla_events|checkins|vehicle_edits|rental_operational_facts/i);
});

test('canonical facts and identity structures are DB append-only', () => {
  for (const relation of [
    'fleet_vehicle_identities',
    'fleet_vehicle_identity_aliases',
    'fleet_membership_facts',
    'fleet_membership_fact_predecessors',
  ]) {
    assert.match(migration, new RegExp(`create trigger ${relation}_append_only_update`));
    assert.match(migration, new RegExp(`create trigger ${relation}_append_only_delete`));
  }
  assert.match(migration, /raise exception 'canonical fleet membership is append-only'/);
});

test('client roles cannot directly create or mutate membership facts', () => {
  assert.match(migration, /revoke all on public\.fleet_membership_facts from public, anon, authenticated, service_role/);
  assert.match(migration, /revoke execute on function public\.append_fleet_membership_fact[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.append_fleet_membership_fact[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant insert on public\.fleet_membership_facts/i);
});

test('source-event boundary is exactly-once and causal', () => {
  assert.match(migration, /fleet_membership_facts_source_event_uidx/);
  assert.match(migration, /source_system, source_entity, source_event_id/);
  assert.match(migration, /ENTRY predecessor is not current canonical head/);
  assert.match(migration, /EXIT predecessor is not current canonical head/);
  assert.match(migration, /ENTRY effective_at predates current canonical head/);
  assert.match(migration, /EXIT effective_at predates current canonical head/);
  assert.doesNotMatch(migration, /order by verified_at/i);
});

test('read contract supports unresolved UNKNOWN without fabricated fact', () => {
  assert.match(migration, /'UNKNOWN'.*'NO_FACT'/s);
  assert.match(migration, /'UNKNOWN'.*'IDENTITY_CONFLICT'/s);
  assert.match(migration, /'UNKNOWN'.*'FACT_CONFLICT'/s);
  assert.match(migration, /membership_fact_id/);
  assert.match(migration, /resolution_reason/);
});

test('identity contract treats VIN as stable and REGNR as reusable alias', () => {
  assert.match(migration, /where alias_type = 'VIN'/);
  assert.match(migration, /where alias_type = 'REGNR'/);
  assert.match(migration, /REGNR is an append-only alias and is not globally unique/);
  assert.match(migration, /cardinality\(v_reg_ids\) > 1/);
});

test('correction is append-only and supersedes all current heads', () => {
  assert.match(migration, /CORRECTION must supersede every current head/);
  assert.match(migration, /correction_of_fact_id/);
  assert.match(migration, /fleet_membership_fact_predecessors/);
});

test('foundation exposes service-role read contract but no consumer integration', () => {
  assert.match(migration, /create or replace function public\.get_fleet_membership/);
  assert.match(migration, /grant execute on function public\.get_fleet_membership\(text,text\) to service_role/);
  assert.doesNotMatch(migration, /tower|wheel.change|hjulskifte/i);
});
