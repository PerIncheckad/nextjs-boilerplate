begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- CANONICAL FLEET MEMBERSHIP V1 / BUILD STEP 3
-- Modern Nybil ENTRY + AVVECKLA EXIT write-through with cutover integrity.
-- No historical backfill, no real T0, no consumer cutover.

-- One transaction-level lock serializes the final T0 application against all
-- modern membership source events. Every path acquires this before identity/
-- source locks so a source event can never pass a T0 application in flight.
create or replace function public.lock_fleet_membership_cutover()
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  select pg_advisory_xact_lock(hashtextextended('FLEET_MEMBERSHIP_V1:CUTOVER', 0));
$$;

-- Resolve identity from one verified source event without silently merging a
-- reused registration number. VIN remains the strongest stable identity.
-- A later verified VIN may be explicitly bound to one conflict-free REGNR-only
-- identity; when a REGNR already belongs to an identity with another VIN, a new
-- VIN identity is created and the REGNR becomes an additional alias on it.
create or replace function public.resolve_fleet_identity_from_verified_source(
  p_regnr text,
  p_vin text,
  p_effective_at timestamptz,
  p_source_system text,
  p_source_entity text,
  p_source_record_id text,
  p_source_event_id text,
  p_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_regnr text := null;
  v_vin text := null;
  v_vin_identity uuid;
  v_reg_ids uuid[] := '{}'::uuid[];
  v_identity_id uuid;
  v_reg_identity_has_vin boolean := false;
begin
  if p_regnr is not null and length(trim(p_regnr)) > 0 then
    v_regnr := public.normalize_fleet_regnr(p_regnr);
  end if;
  if p_vin is not null and length(trim(p_vin)) > 0 then
    v_vin := public.normalize_fleet_vin(p_vin);
  end if;
  if v_regnr is null and v_vin is null then
    raise exception 'verified source requires regnr or VIN';
  end if;
  if p_effective_at is null then
    raise exception 'verified source effective_at is required';
  end if;
  if coalesce(length(trim(p_source_system)), 0) = 0
     or coalesce(length(trim(p_source_entity)), 0) = 0
     or coalesce(length(trim(p_source_event_id)), 0) = 0 then
    raise exception 'verified source identity/event is required';
  end if;

  perform public.lock_fleet_identity_keys(v_regnr, v_vin);

  if v_vin is not null then
    select a.identity_id into v_vin_identity
    from public.fleet_vehicle_identity_aliases a
    where a.alias_type = 'VIN' and a.alias_value = v_vin;
  end if;

  if v_regnr is not null then
    select coalesce(array_agg(distinct a.identity_id order by a.identity_id), '{}'::uuid[])
      into v_reg_ids
    from public.fleet_vehicle_identity_aliases a
    where a.alias_type = 'REGNR' and a.alias_value = v_regnr;
  end if;

  -- Existing VIN identity wins. REGNR is explicitly bound as an alias if this
  -- verified event establishes a new/reused registration for that VIN.
  if v_vin_identity is not null then
    if v_regnr is not null and not exists (
      select 1 from public.fleet_vehicle_identity_aliases a
      where a.identity_id = v_vin_identity
        and a.alias_type = 'REGNR'
        and a.alias_value = v_regnr
    ) then
      perform public.bind_fleet_vehicle_identity_alias(
        v_vin_identity, 'REGNR', v_regnr, p_effective_at,
        p_source_system, p_source_entity, p_source_record_id, p_source_event_id,
        coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('binding_reason', 'VERIFIED_SOURCE_REGNR_FOR_EXISTING_VIN')
      );
    end if;
    return v_vin_identity;
  end if;

  if v_vin is not null then
    if cardinality(v_reg_ids) = 1 then
      v_identity_id := v_reg_ids[1];
      select exists (
        select 1 from public.fleet_vehicle_identity_aliases a
        where a.identity_id = v_identity_id and a.alias_type = 'VIN'
      ) into v_reg_identity_has_vin;

      if not v_reg_identity_has_vin then
        -- Explicit verified identity binding: this is not ordinary create/resolve.
        perform public.bind_fleet_vehicle_identity_alias(
          v_identity_id, 'VIN', v_vin, p_effective_at,
          p_source_system, p_source_entity, p_source_record_id, p_source_event_id,
          coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('binding_reason', 'VERIFIED_SOURCE_VIN_FOR_REGNR_ONLY_IDENTITY')
        );
        return v_identity_id;
      end if;
      -- The REGNR already belongs to a different VIN identity. Treat this as
      -- registration reuse: create a new VIN identity, never merge vehicles.
    end if;

    v_identity_id := public.create_fleet_vehicle_identity(
      null, v_vin, p_effective_at,
      p_source_system, p_source_entity, p_source_record_id, p_source_event_id,
      coalesce(p_evidence, '{}'::jsonb)
    );
    if v_regnr is not null then
      perform public.bind_fleet_vehicle_identity_alias(
        v_identity_id, 'REGNR', v_regnr, p_effective_at,
        p_source_system, p_source_entity, p_source_record_id, p_source_event_id,
        coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('binding_reason', 'VERIFIED_SOURCE_REGNR_FOR_NEW_VIN_IDENTITY')
      );
    end if;
    return v_identity_id;
  end if;

  if cardinality(v_reg_ids) = 0 then
    return public.create_fleet_vehicle_identity(
      v_regnr, null, p_effective_at,
      p_source_system, p_source_entity, p_source_record_id, p_source_event_id,
      coalesce(p_evidence, '{}'::jsonb)
    );
  elsif cardinality(v_reg_ids) = 1 then
    return v_reg_ids[1];
  end if;

  raise exception 'IDENTITY_CONFLICT: verified REGNR resolves to multiple canonical identities without VIN';
end;
$$;

-- Exact Nybil source adapter. The source event identity is the source-owned
-- nybil_inventering.id. It may append ENTRY only after the exact Garage->Nybil
-- handoff has been persisted in this same transaction.
create or replace function public.append_fleet_membership_entry_from_nybil(
  p_nybil_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_nybil public.nybil_inventering%rowtype;
  v_item public.garage_items%rowtype;
  v_identity_id uuid;
  v_current record;
  v_existing public.fleet_membership_facts%rowtype;
  v_predecessors uuid[] := '{}'::uuid[];
  v_evidence jsonb;
begin
  perform public.lock_fleet_membership_cutover();

  select * into v_nybil
  from public.nybil_inventering
  where id = p_nybil_id;
  if not found then
    raise exception 'NYBIL_ENTRY_SOURCE_NOT_FOUND: nybil_inventering %', p_nybil_id;
  end if;
  if v_nybil.source_garage_item_id is null then
    raise exception 'NYBIL_ENTRY_SOURCE_INVALID: exact Garage handoff is required';
  end if;

  select * into v_item
  from public.garage_items
  where garage_item_id = v_nybil.source_garage_item_id
  for update;
  if not found
     or v_item.garage_direction <> 'IN'
     or v_item.voided_at is not null
     or v_item.handed_off_nybil_id is distinct from v_nybil.id
     or v_item.handed_off_at is null then
    raise exception 'NYBIL_ENTRY_SOURCE_INVALID: Garage->Nybil handoff is not verified';
  end if;
  if public.normalize_fleet_regnr(v_item.regnr) <> public.normalize_fleet_regnr(v_nybil.regnr) then
    raise exception 'NYBIL_ENTRY_SOURCE_INVALID: Garage/Nybil regnr mismatch';
  end if;
  if nullif(trim(coalesce(v_item.vin, '')), '') is not null
     and nullif(trim(coalesce(v_nybil.vin, '')), '') is not null
     and public.normalize_fleet_vin(v_item.vin) <> public.normalize_fleet_vin(v_nybil.vin) then
    raise exception 'NYBIL_ENTRY_SOURCE_INVALID: Garage/Nybil VIN mismatch';
  end if;

  v_evidence := jsonb_build_object(
    'nybil_id', v_nybil.id,
    'garage_item_id', v_item.garage_item_id,
    'garage_handed_off_at', v_item.handed_off_at,
    'verified_regnr', public.normalize_fleet_regnr(v_nybil.regnr),
    'verified_vin', case when nullif(trim(coalesce(v_nybil.vin, '')), '') is null then null else public.normalize_fleet_vin(v_nybil.vin) end,
    'registrerad_av', v_nybil.registrerad_av
  );

  v_identity_id := public.resolve_fleet_identity_from_verified_source(
    v_nybil.regnr,
    v_nybil.vin,
    v_nybil.created_at,
    'NYBIL',
    'nybil_inventering',
    v_nybil.id::text,
    v_nybil.id::text,
    v_evidence
  );

  -- Exact retry is idempotent independently of the current head.
  select f.* into v_existing
  from public.fleet_membership_facts f
  where f.source_system = 'NYBIL'
    and f.source_entity = 'nybil_inventering'
    and f.source_event_id = v_nybil.id::text;
  if found then
    if v_existing.identity_id = v_identity_id
       and v_existing.membership_state = 'ACTIVE'
       and v_existing.basis = 'ENTRY'
       and v_existing.effective_at = v_nybil.created_at
       and v_existing.source_record_id = v_nybil.id::text then
      return v_existing.fact_id;
    end if;
    raise exception 'SOURCE_EVENT_CONFLICT: Nybil source event already has another canonical payload';
  end if;

  select * into v_current
  from public.fleet_membership_current_by_identity c
  where c.identity_id = v_identity_id;
  if not found then
    raise exception 'NYBIL_ENTRY_IDENTITY_NOT_RESOLVED';
  end if;
  if v_current.resolution_reason = 'FACT_CONFLICT' then
    raise exception 'FACT_CONFLICT requires CORRECTION before Nybil ENTRY';
  end if;
  if v_current.resolution_reason = 'RESOLVED' then
    v_predecessors := array[v_current.membership_fact_id]::uuid[];
  end if;

  return public.append_fleet_membership_fact(
    v_identity_id,
    'ACTIVE',
    'ENTRY',
    v_nybil.created_at,
    'NYBIL',
    'nybil_inventering',
    v_nybil.id::text,
    v_nybil.id::text,
    null,
    'MANUELL',
    coalesce(nullif(trim(coalesce(v_nybil.fullstandigt_namn, '')), ''), nullif(trim(coalesce(v_nybil.registrerad_av, '')), '')),
    null,
    v_evidence,
    v_predecessors,
    null
  );
end;
$$;

-- Exact AVVECKLA source adapter. The only allowed initial EXIT source is an
-- existing immutable terminal garage_avveckla_events row with one of the three
-- locked event types. This helper is internal and is never granted to clients.
create or replace function public.append_fleet_membership_exit_from_avveckla(
  p_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.garage_avveckla_events%rowtype;
  v_item public.garage_items%rowtype;
  v_case public.garage_avveckla_cases%rowtype;
  v_identity_id uuid;
  v_current record;
  v_existing public.fleet_membership_facts%rowtype;
  v_t0_live boolean;
  v_fact_id uuid;
  v_evidence jsonb;
begin
  perform public.lock_fleet_membership_cutover();

  select * into v_event
  from public.garage_avveckla_events
  where event_id = p_event_id;
  if not found then
    raise exception 'INITIAL_EXIT_SOURCE_REJECT: AVVECKLA event does not exist';
  end if;
  if v_event.event_type not in (
    'UT_OVERLAMNING_VERIFIERAD',
    'UT_TRANSPORTOR_HAMTAT_VERIFIERAD',
    'UT_AVSTALLNING_VERIFIERAD'
  ) then
    raise exception 'INITIAL_EXIT_SOURCE_REJECT: event is not a canonical terminal AVVECKLA source';
  end if;
  if v_event.event_key <> 'garage-avveckla:' || v_event.avveckla_case_id::text || ':TERMINAL_UT'
     or nullif(trim(coalesce(v_event.evidence_reference, '')), '') is null then
    raise exception 'INITIAL_EXIT_SOURCE_REJECT: terminal AVVECKLA provenance is invalid';
  end if;

  select * into v_item
  from public.garage_items
  where garage_item_id = v_event.garage_item_id
  for update;
  if not found or v_item.garage_direction <> 'UT' or v_item.voided_at is not null then
    raise exception 'INITIAL_EXIT_SOURCE_REJECT: Garage source is invalid';
  end if;

  select * into v_case
  from public.garage_avveckla_cases
  where avveckla_case_id = v_event.avveckla_case_id
  for update;
  if not found
     or v_case.garage_item_id <> v_event.garage_item_id
     or v_case.regnr <> v_event.regnr then
    raise exception 'INITIAL_EXIT_SOURCE_REJECT: AVVECKLA case/event mismatch';
  end if;

  v_evidence := jsonb_build_object(
    'garage_avveckla_event_id', v_event.event_id,
    'garage_item_id', v_event.garage_item_id,
    'avveckla_case_id', v_event.avveckla_case_id,
    'terminal_event_type', v_event.event_type,
    'evidence_reference', v_event.evidence_reference,
    'verified_regnr', v_event.regnr,
    'garage_vin', v_item.vin
  );

  v_identity_id := public.resolve_fleet_identity_from_verified_source(
    v_event.regnr,
    v_item.vin,
    v_event.occurred_at,
    'GARAGE_AVVECKLA',
    'garage_avveckla_events',
    v_event.event_id::text,
    v_event.event_id::text,
    v_evidence
  );

  perform pg_advisory_xact_lock(hashtextextended(
    'FLEET_SOURCE_EVENT:GARAGE_AVVECKLA:garage_avveckla_events:' || v_event.event_id::text,
    0
  ));

  -- Exact source-event retry returns the same fact even if T0 became live later.
  select f.* into v_existing
  from public.fleet_membership_facts f
  where f.source_system = 'GARAGE_AVVECKLA'
    and f.source_entity = 'garage_avveckla_events'
    and f.source_event_id = v_event.event_id::text;
  if found then
    if v_existing.identity_id = v_identity_id
       and v_existing.membership_state = 'INACTIVE'
       and v_existing.basis = 'EXIT'
       and v_existing.effective_at = v_event.occurred_at
       and v_existing.source_record_id = v_event.event_id::text then
      return v_existing.fact_id;
    end if;
    raise exception 'SOURCE_EVENT_CONFLICT: AVVECKLA source event already has another canonical payload';
  end if;

  select * into v_current
  from public.fleet_membership_current_by_identity c
  where c.identity_id = v_identity_id;
  if not found then
    raise exception 'AVVECKLA_EXIT_IDENTITY_NOT_RESOLVED';
  end if;

  if v_current.resolution_reason = 'NO_FACT' then
    select exists (
      select 1
      from public.fleet_membership_bootstrap_batch_status s
      where s.bootstrap_denominator_eligible
    ) into v_t0_live;

    if v_t0_live then
      raise exception 'POST_T0_NO_FACT_EXIT_REJECT: EXIT requires an existing ACTIVE canonical head';
    end if;

    -- Narrow cutover exception: direct append of exactly one initial EXIT from
    -- the verified AVVECKLA event. No ACTIVE/ENTRY history is fabricated.
    insert into public.fleet_membership_facts (
      identity_id,
      membership_state,
      basis,
      effective_at,
      source_system,
      source_entity,
      source_record_id,
      source_event_id,
      actor_id,
      actor_source,
      actor_name,
      actor_email,
      evidence,
      correction_of_fact_id
    ) values (
      v_identity_id,
      'INACTIVE',
      'EXIT',
      v_event.occurred_at,
      'GARAGE_AVVECKLA',
      'garage_avveckla_events',
      v_event.event_id::text,
      v_event.event_id::text,
      v_event.actor_id,
      v_event.actor_source,
      null,
      v_event.actor_email,
      v_evidence || jsonb_build_object('initial_exit_pre_t0', true),
      null
    ) returning fact_id into v_fact_id;

    return v_fact_id;
  end if;

  if v_current.resolution_reason <> 'RESOLVED' then
    raise exception 'FACT_CONFLICT requires CORRECTION before AVVECKLA EXIT';
  end if;
  if v_current.membership_state <> 'ACTIVE' then
    raise exception 'EXIT requires exactly one ACTIVE canonical head';
  end if;

  return public.append_fleet_membership_fact(
    v_identity_id,
    'INACTIVE',
    'EXIT',
    v_event.occurred_at,
    'GARAGE_AVVECKLA',
    'garage_avveckla_events',
    v_event.event_id::text,
    v_event.event_id::text,
    v_event.actor_id,
    v_event.actor_source,
    null,
    v_event.actor_email,
    v_evidence || jsonb_build_object('initial_exit_pre_t0', false),
    array[v_current.membership_fact_id]::uuid[],
    null
  );
end;
$$;

-- Extend the existing atomic Garage -> Nybil handoff. Because this is an AFTER
-- INSERT trigger, a membership failure rolls back the Nybil row and the Garage
-- handoff together with every other trigger side effect in the same statement.
create or replace function public.sync_nybil_garage_handoff()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item public.garage_items%rowtype;
begin
  if new.source_garage_item_id is null then
    return new;
  end if;

  perform public.lock_fleet_membership_cutover();

  select * into v_item
  from public.garage_items
  where garage_item_id = new.source_garage_item_id
  for update;

  if not found then
    raise exception 'Garage item % does not exist', new.source_garage_item_id;
  end if;
  if v_item.garage_direction <> 'IN' then
    raise exception 'Garage item % is not UTVECKLA / IN', new.source_garage_item_id;
  end if;
  if v_item.voided_at is not null then
    raise exception 'Garage item % is voided and cannot be handed off to Nybil', new.source_garage_item_id;
  end if;
  if v_item.regnr is null
     or public.normalize_fleet_regnr(v_item.regnr) <> public.normalize_fleet_regnr(new.regnr) then
    raise exception 'Garage/Nybil regnr mismatch for Garage item %', new.source_garage_item_id;
  end if;
  if nullif(trim(coalesce(v_item.vin, '')), '') is not null
     and nullif(trim(coalesce(new.vin, '')), '') is not null
     and public.normalize_fleet_vin(v_item.vin) <> public.normalize_fleet_vin(new.vin) then
    raise exception 'Garage/Nybil VIN mismatch for Garage item %', new.source_garage_item_id;
  end if;
  if v_item.handed_off_nybil_id is not null and v_item.handed_off_nybil_id <> new.id then
    raise exception 'Garage item % is already handed off to Nybil %', new.source_garage_item_id, v_item.handed_off_nybil_id;
  end if;

  update public.garage_items
  set handed_off_nybil_id = new.id,
      handed_off_at = coalesce(handed_off_at, now()),
      updated_at = now()
  where garage_item_id = new.source_garage_item_id;

  perform public.append_fleet_membership_entry_from_nybil(new.id);

  return new;
end;
$$;

-- T0 application now participates in the same cutover lock. Existing Step 2
-- behavior is preserved otherwise.
create or replace function public.apply_fleet_membership_bootstrap_batch(
  p_batch_id uuid,
  p_expected_revision_hash text,
  p_applied_by_name text,
  p_applied_at timestamptz,
  p_applied_by_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_batch public.fleet_membership_bootstrap_batches%rowtype;
  v_seal public.fleet_membership_bootstrap_seals%rowtype;
  v_existing public.fleet_membership_bootstrap_applications%rowtype;
  v_application_id uuid := gen_random_uuid();
  v_current record;
  v_item record;
  v_fact_id uuid;
  v_outcome text;
  v_source_event_id text;
  v_manifest_now text;
begin
  if coalesce(length(trim(p_expected_revision_hash)), 0) = 0 then raise exception 'expected revision hash is required'; end if;
  if coalesce(length(trim(p_applied_by_name)), 0) = 0 or p_applied_at is null then raise exception 'bootstrap application actor is required'; end if;

  perform public.lock_fleet_membership_cutover();
  perform public.lock_fleet_bootstrap_batch(p_batch_id);

  select * into v_batch
  from public.fleet_membership_bootstrap_batches
  where batch_id = p_batch_id;
  if not found then raise exception 'unknown bootstrap batch %', p_batch_id; end if;

  select * into v_seal
  from public.fleet_membership_bootstrap_seals
  where batch_id = p_batch_id;
  if not found then raise exception 'BOOTSTRAP_NOT_VERIFIED: batch must be sealed before application'; end if;

  if v_seal.revision_hash <> p_expected_revision_hash then
    raise exception 'BOOTSTRAP_APPLICATION_CONFLICT: expected revision hash does not match verified batch';
  end if;

  v_manifest_now := public.compute_fleet_bootstrap_manifest_hash(p_batch_id);
  if v_manifest_now <> v_seal.manifest_hash then
    raise exception 'BOOTSTRAP_MANIFEST_CHANGED: sealed manifest no longer matches verified hash';
  end if;

  select * into v_existing
  from public.fleet_membership_bootstrap_applications
  where batch_id = p_batch_id;
  if found then
    if v_existing.revision_hash = p_expected_revision_hash
       and v_existing.manifest_hash = v_seal.manifest_hash then
      return v_existing.application_id;
    end if;
    raise exception 'BOOTSTRAP_APPLICATION_CONFLICT: batch/revision was already applied inconsistently';
  end if;

  insert into public.fleet_membership_bootstrap_applications (
    application_id, batch_id, manifest_hash, revision_hash,
    applied_by_name, applied_by_email, applied_at
  ) values (
    v_application_id, p_batch_id, v_seal.manifest_hash, v_seal.revision_hash,
    p_applied_by_name, p_applied_by_email, p_applied_at
  );

  for v_item in
    select i.*
    from public.fleet_membership_bootstrap_items i
    where i.batch_id = p_batch_id
    order by i.item_key
  loop
    if v_item.identity_id is null then
      insert into public.fleet_membership_bootstrap_item_applications (
        application_id, item_id, outcome
      ) values (v_application_id, v_item.item_id, 'UNRESOLVED');
      continue;
    end if;

    select * into v_current
    from public.fleet_membership_current_by_identity c
    where c.identity_id = v_item.identity_id;

    if v_current.resolution_reason = 'NO_FACT' then
      v_source_event_id := 'BOOTSTRAP:' || v_batch.batch_key || ':' || v_batch.revision_no::text || ':' || v_item.item_key;
      v_fact_id := public.append_fleet_membership_fact(
        v_item.identity_id,
        v_item.membership_state,
        'CURRENT_BASELINE',
        v_batch.t0,
        'CANONICAL_BOOTSTRAP',
        'FLEET_MEMBERSHIP_BOOTSTRAP_ITEM',
        v_item.item_id::text,
        v_source_event_id,
        null,
        'MANUELL',
        v_item.verifier_name,
        v_item.verifier_email,
        jsonb_build_object(
          'bootstrap_batch_key', v_batch.batch_key,
          'bootstrap_revision_no', v_batch.revision_no,
          'bootstrap_revision_hash', v_seal.revision_hash,
          'bootstrap_item_key', v_item.item_key,
          'bootstrap_source', jsonb_build_object(
            'system', v_item.source_system,
            'entity', v_item.source_entity,
            'record_id', v_item.source_record_id,
            'event_id', v_item.source_event_id
          ),
          'bootstrap_evidence', v_item.evidence
        ),
        '{}'::uuid[],
        null
      );
      v_outcome := 'BASELINE_FACT_WRITTEN';

      insert into public.fleet_membership_bootstrap_item_applications (
        application_id, item_id, outcome, membership_fact_id, canonical_state, canonical_basis
      ) values (
        v_application_id, v_item.item_id, v_outcome, v_fact_id, v_item.membership_state, 'CURRENT_BASELINE'
      );
    elsif v_current.resolution_reason = 'RESOLVED' then
      if v_current.effective_at > v_batch.t0 then
        raise exception 'BOOTSTRAP_T0_STALE: canonical membership fact is newer than batch T0 for identity %', v_item.identity_id;
      end if;
      if v_current.membership_state <> v_item.membership_state then
        raise exception 'BOOTSTRAP_CANONICAL_STATE_MISMATCH: verified T0 state differs from canonical state for identity %', v_item.identity_id;
      end if;
      insert into public.fleet_membership_bootstrap_item_applications (
        application_id, item_id, outcome, membership_fact_id, canonical_state, canonical_basis
      ) values (
        v_application_id, v_item.item_id, 'CANONICAL_STATE_CONFIRMED',
        v_current.membership_fact_id, v_current.membership_state, v_current.basis
      );
    else
      raise exception 'BOOTSTRAP_CANONICAL_CONFLICT: canonical identity % must be resolved before bootstrap application', v_item.identity_id;
    end if;
  end loop;

  return v_application_id;
end;
$$;

-- Add canonical EXIT inside the existing terminal AVVECKLA transaction. If any
-- later Layer 1/case/Garage write fails, the event and membership fact roll back.
create or replace function public.complete_garage_avveckla_ut_internal(
  p_garage_item_id uuid,
  p_event_type text,
  p_occurred_at timestamptz,
  p_evidence_reference text,
  p_actor uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.garage_items%rowtype;
  v_case public.garage_avveckla_cases%rowtype;
  v_period public.vehicle_journey_periods%rowtype;
  v_avveckla_case_id uuid;
  v_event_id uuid;
  v_membership_fact_id uuid;
  v_normalized_regnr text;
  v_evidence text := nullif(trim(coalesce(p_evidence_reference, '')), '');
  v_method text;
  v_period_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor is null then raise exception 'Aktör krävs' using errcode = '22023'; end if;
  if p_occurred_at is null then raise exception 'Verklig tidpunkt för UT-händelsen krävs' using errcode = '22023'; end if;
  if v_evidence is null then raise exception 'Evidensreferens krävs för verifierat UT' using errcode = '22023'; end if;

  v_method := case p_event_type
    when 'UT_OVERLAMNING_VERIFIERAD' then 'EGEN_LEVERANS'
    when 'UT_TRANSPORTOR_HAMTAT_VERIFIERAD' then 'EXTERN_TRANSPORT'
    when 'UT_AVSTALLNING_VERIFIERAD' then 'AVSTALLNING'
    else null
  end;
  if v_method is null then raise exception 'Ogiltig terminal UT-händelse' using errcode = '22023'; end if;

  perform public.lock_fleet_membership_cutover();

  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;
  if not found then raise exception 'Garage-objektet finns inte' using errcode = 'P0002'; end if;
  if v_item.garage_direction <> 'UT' then raise exception 'Terminalt UT kräver Garage-riktning UT' using errcode = 'P0001'; end if;
  if v_item.voided_at is not null then raise exception 'Makulerat Garage-objekt kan inte avslutas som verifierat UT' using errcode = 'P0001'; end if;
  if v_item.handed_off_nybil_id is not null then raise exception 'Garage-objektet är redan överlämnat till Ny bil' using errcode = 'P0001'; end if;
  if v_item.completed_at is not null then raise exception 'Garage-objektet är redan verifierat UT och avslutat' using errcode = 'P0001'; end if;
  if nullif(trim(coalesce(v_item.regnr, '')), '') is null then raise exception 'Verifierat UT kräver registreringsnummer' using errcode = 'P0001'; end if;

  v_normalized_regnr := upper(regexp_replace(v_item.regnr, '\s+', '', 'g'));
  v_avveckla_case_id := public.assert_garage_avveckla_ready_for_completion(p_garage_item_id);

  select * into v_case
  from public.garage_avveckla_cases
  where avveckla_case_id = v_avveckla_case_id
  for update;
  if v_case.regnr <> v_normalized_regnr then raise exception 'AVVECKLA/Garage regnr mismatch' using errcode = 'P0001'; end if;

  select count(*) into v_period_count
  from public.vehicle_journey_periods
  where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_normalized_regnr
    and ended_at is null;
  if v_period_count = 0 then raise exception 'Aktuell öppen fordonsperiod saknas; UT får inte fabricera Layer 1-historik' using errcode = 'P0002'; end if;
  if v_period_count > 1 then raise exception 'Flera öppna fordonsperioder finns för bilen; UT stoppas' using errcode = 'P0001'; end if;

  select * into v_period
  from public.vehicle_journey_periods
  where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_normalized_regnr
    and ended_at is null
  for update;
  if p_occurred_at < v_period.started_at then raise exception 'UT-händelsen kan inte inträffa före aktuell fordonsperiod' using errcode = '22007'; end if;

  insert into public.garage_avveckla_events (
    avveckla_case_id, garage_item_id, regnr, event_type, event_key, occurred_at,
    actor_id, actor_email, actor_source, evidence_reference, payload
  ) values (
    v_case.avveckla_case_id,
    v_item.garage_item_id,
    v_normalized_regnr,
    p_event_type,
    'garage-avveckla:' || v_case.avveckla_case_id::text || ':TERMINAL_UT',
    p_occurred_at,
    p_actor,
    nullif(trim(coalesce(p_actor_email, '')), ''),
    'MANUELL',
    v_evidence,
    jsonb_build_object(
      'garageItemId', v_item.garage_item_id,
      'avvecklaCaseId', v_case.avveckla_case_id,
      'regnr', v_normalized_regnr,
      'method', v_method,
      'journeyPeriodId', v_period.period_id,
      'evidenceReference', v_evidence
    )
  ) returning event_id into v_event_id;

  v_membership_fact_id := public.append_fleet_membership_exit_from_avveckla(v_event_id);

  perform public.close_vehicle_journey_period_from_source(
    v_period.period_id,
    v_period.regnr,
    p_occurred_at,
    'GARAGE_AVVECKLA',
    'garage_avveckla_events',
    v_event_id::text,
    p_actor,
    'MANUELL',
    nullif(trim(coalesce(p_actor_email, '')), '')
  );

  update public.garage_avveckla_cases
  set status = 'COMPLETED',
      completed_at = p_occurred_at,
      completed_by = p_actor,
      completion_event_id = v_event_id,
      updated_at = v_now
  where avveckla_case_id = v_case.avveckla_case_id;

  update public.garage_items
  set completed_at = p_occurred_at,
      completed_by = p_actor,
      completion_event_id = v_event_id,
      updated_at = v_now,
      updated_by = p_actor
  where garage_item_id = v_item.garage_item_id;

  return jsonb_build_object(
    'garage_item_id', v_item.garage_item_id,
    'avveckla_case_id', v_case.avveckla_case_id,
    'regnr', v_normalized_regnr,
    'method', v_method,
    'completion_event_id', v_event_id,
    'membership_fact_id', v_membership_fact_id,
    'journey_period_id', v_period.period_id,
    'completed_at', p_occurred_at
  );
end;
$$;

-- Internal-only helpers. Client roles, including service_role, cannot use the
-- cutover exception directly or fabricate source provenance.
revoke all on function public.lock_fleet_membership_cutover() from public, anon, authenticated, service_role;
revoke all on function public.resolve_fleet_identity_from_verified_source(text,text,timestamptz,text,text,text,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.append_fleet_membership_entry_from_nybil(uuid) from public, anon, authenticated, service_role;
revoke all on function public.append_fleet_membership_exit_from_avveckla(uuid) from public, anon, authenticated, service_role;
revoke all on function public.sync_nybil_garage_handoff() from public, anon, authenticated, service_role;

grant execute on function public.apply_fleet_membership_bootstrap_batch(uuid,text,text,timestamptz,text) to service_role;
revoke execute on function public.complete_garage_avveckla_ut_internal(uuid,text,timestamptz,text,uuid,text) from public, anon, authenticated, service_role;

comment on function public.lock_fleet_membership_cutover() is
  'Serializes final T0 application against modern Nybil ENTRY and AVVECKLA EXIT membership write-through.';
comment on function public.append_fleet_membership_entry_from_nybil(uuid) is
  'Internal exact-source adapter: verified nybil_inventering row after exact Garage IN handoff -> canonical ENTRY ACTIVE.';
comment on function public.append_fleet_membership_exit_from_avveckla(uuid) is
  'Internal exact-source adapter: immutable verified terminal garage_avveckla_events row -> canonical EXIT INACTIVE. Allows NO_FACT initial EXIT only before a denominator-eligible COMPLETE T0 exists.';
comment on function public.complete_garage_avveckla_ut_internal(uuid,text,timestamptz,text,uuid,text) is
  'Atomic terminal UT handoff plus canonical fleet EXIT. Terminal AVVECKLA event, Layer 1 closure, Garage/case completion and membership fact commit or roll back together.';

commit;
