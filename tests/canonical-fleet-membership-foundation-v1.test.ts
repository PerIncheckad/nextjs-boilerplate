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

test('identity create is serialized on normalized keys with deterministic lock ordering', () => {
  assert.match(migration, /create or replace function public\.lock_fleet_identity_keys/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('FLEET_IDENTITY:' \|\| v_key, 0\)\)/);
  assert.match(migration, /order by k\.identity_key/);
  assert.match(migration, /perform public\.lock_fleet_identity_keys\(v_regnr, v_vin\)/);
});

test('ordinary identity create cannot implicitly bind an existing REGNR identity to a new VIN', () => {
  assert.match(migration, /IDENTITY_BINDING_REQUIRED: existing canonical identity requires explicit verified alias binding/);
  assert.match(migration, /IDENTITY_CONFLICT: VIN and registration number belong to different canonical identities/);
  assert.match(migration, /create or replace function public\.bind_fleet_vehicle_identity_alias/);
  assert.match(migration, /verified identity binding requires evidence or source-record provenance/);
  assert.match(migration, /IDENTITY_CONFLICT: VIN is already bound to another canonical identity/);
});

test('source-event exactly-once retries require identical canonical payload', () => {
  assert.match(migration, /fleet_membership_facts_source_event_uidx/);
  assert.match(migration, /FLEET_SOURCE_EVENT:/);
  assert.match(migration, /SOURCE_EVENT_CONFLICT: source event id already exists with a different canonical payload/);
  for (const field of [
    'identity_id',
    'membership_state',
    'basis',
    'effective_at',
    'correction_of_fact_id',
    'source_record_id',
  ]) {
    assert.match(migration, new RegExp(`v_existing_fact\\.${field} is not distinct from p_${field.replace('identity_id', 'identity_id').replace('membership_state', 'membership_state').replace('basis', 'basis').replace('effective_at', 'effective_at').replace('correction_of_fact_id', 'correction_of_fact_id').replace('source_record_id', 'source_record_id')}`));
  }
  assert.match(migration, /v_existing_predecessor_ids = v_supplied_ids/);
});

test('source-event boundary remains causal', () => {
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

test('foundation exposes controlled service-role boundaries but no consumer integration', () => {
  assert.match(migration, /grant execute on function public\.create_fleet_vehicle_identity[\s\S]*to service_role/);
  assert.match(migration, /grant execute on function public\.bind_fleet_vehicle_identity_alias[\s\S]*to service_role/);
  assert.match(migration, /create or replace function public\.get_fleet_membership/);
  assert.match(migration, /grant execute on function public\.get_fleet_membership\(text,text\) to service_role/);
  assert.doesNotMatch(migration, /tower|wheel.change|hjulskifte/i);
});
