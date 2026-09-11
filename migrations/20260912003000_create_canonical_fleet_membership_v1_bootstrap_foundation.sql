begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- CANONICAL FLEET MEMBERSHIP V1 / BUILD STEP 2
-- Manual bootstrap foundation only.
-- No Production bootstrap data, no Nybil/AVVECKLA write-through and no consumer cutover.

create table public.fleet_membership_bootstrap_batches (
  batch_id uuid primary key default gen_random_uuid(),
  batch_key text not null check (length(trim(batch_key)) > 0),
  revision_no integer not null check (revision_no > 0),
  t0 timestamptz not null,
  scope text not null default 'OWN_FLEET' check (scope = 'OWN_FLEET'),
  coverage_mode text not null check (coverage_mode in ('PARTIAL', 'COMPLETE_ACTIVE_POPULATION')),
  source_system text not null check (length(trim(source_system)) > 0),
  source_entity text not null check (length(trim(source_entity)) > 0),
  source_record_id text,
  source_event_id text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (batch_key, revision_no)
);

create table public.fleet_membership_bootstrap_items (
  item_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.fleet_membership_bootstrap_batches(batch_id) on delete restrict,
  item_key text not null check (length(trim(item_key)) > 0),
  identity_id uuid references public.fleet_vehicle_identities(identity_id) on delete restrict,
  membership_state text not null check (membership_state in ('ACTIVE', 'INACTIVE', 'UNKNOWN')),
  resolution_reason text not null check (resolution_reason in ('RESOLVED', 'NO_CANONICAL_IDENTITY', 'IDENTITY_CONFLICT')),
  regnr_snapshot text,
  vin_snapshot text,
  source_system text not null check (length(trim(source_system)) > 0),
  source_entity text not null check (length(trim(source_entity)) > 0),
  source_record_id text,
  source_event_id text,
  verifier_source text not null default 'BILKONTROLL' check (verifier_source = 'BILKONTROLL'),
  verifier_name text not null check (length(trim(verifier_name)) > 0),
  verifier_email text,
  verified_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (batch_id, item_key),
  check (regnr_snapshot is not null or vin_snapshot is not null),
  check (
    (identity_id is not null and resolution_reason = 'RESOLVED')
    or
    (identity_id is null and membership_state = 'UNKNOWN' and resolution_reason in ('NO_CANONICAL_IDENTITY', 'IDENTITY_CONFLICT'))
  )
);

create index fleet_membership_bootstrap_items_identity_idx
  on public.fleet_membership_bootstrap_items (identity_id)
  where identity_id is not null;

create table public.fleet_membership_bootstrap_seals (
  batch_id uuid primary key references public.fleet_membership_bootstrap_batches(batch_id) on delete restrict,
  manifest_hash text not null check (length(manifest_hash) = 32),
  revision_hash text not null check (length(revision_hash) = 32),
  hash_algorithm text not null default 'MD5' check (hash_algorithm = 'MD5'),
  verifier_source text not null default 'BILKONTROLL' check (verifier_source = 'BILKONTROLL'),
  verifier_name text not null check (length(trim(verifier_name)) > 0),
  verifier_email text,
  verified_at timestamptz not null,
  attestation_text text,
  verification_evidence jsonb not null default '{}'::jsonb,
  complete_active_population_attested boolean not null default false,
  created_at timestamptz not null default now(),
  unique (revision_hash)
);

create table public.fleet_membership_bootstrap_applications (
  application_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique references public.fleet_membership_bootstrap_batches(batch_id) on delete restrict,
  manifest_hash text not null check (length(manifest_hash) = 32),
  revision_hash text not null check (length(revision_hash) = 32),
  applied_by_name text not null check (length(trim(applied_by_name)) > 0),
  applied_by_email text,
  applied_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.fleet_membership_bootstrap_item_applications (
  application_id uuid not null references public.fleet_membership_bootstrap_applications(application_id) on delete restrict,
  item_id uuid not null references public.fleet_membership_bootstrap_items(item_id) on delete restrict,
  outcome text not null check (outcome in ('BASELINE_FACT_WRITTEN', 'CANONICAL_STATE_CONFIRMED', 'UNRESOLVED')),
  membership_fact_id uuid references public.fleet_membership_facts(fact_id) on delete restrict,
  canonical_state text check (canonical_state in ('ACTIVE', 'INACTIVE', 'UNKNOWN')),
  canonical_basis text check (canonical_basis in ('CURRENT_BASELINE', 'ENTRY', 'EXIT', 'CORRECTION')),
  created_at timestamptz not null default now(),
  primary key (application_id, item_id),
  check (
    (outcome = 'UNRESOLVED' and membership_fact_id is null and canonical_state is null and canonical_basis is null)
    or
    (outcome in ('BASELINE_FACT_WRITTEN', 'CANONICAL_STATE_CONFIRMED') and membership_fact_id is not null and canonical_state is not null and canonical_basis is not null)
  )
);

create or replace function public.reject_fleet_bootstrap_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'canonical fleet bootstrap is append-only';
end;
$$;

create or replace function public.enforce_fleet_bootstrap_item_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.fleet_membership_bootstrap_seals s where s.batch_id = new.batch_id
  ) then
    raise exception 'BOOTSTRAP_REVISION_SEALED: items cannot be added after verification';
  end if;
  return new;
end;
$$;

create trigger fleet_membership_bootstrap_batches_append_only_update
before update on public.fleet_membership_bootstrap_batches
for each row execute function public.reject_fleet_bootstrap_mutation();
create trigger fleet_membership_bootstrap_batches_append_only_delete
before delete on public.fleet_membership_bootstrap_batches
for each row execute function public.reject_fleet_bootstrap_mutation();

create trigger fleet_membership_bootstrap_items_insert_guard
before insert on public.fleet_membership_bootstrap_items
for each row execute function public.enforce_fleet_bootstrap_item_insert();
create trigger fleet_membership_bootstrap_items_append_only_update
before update on public.fleet_membership_bootstrap_items
for each row execute function public.reject_fleet_bootstrap_mutation();
create trigger fleet_membership_bootstrap_items_append_only_delete
before delete on public.fleet_membership_bootstrap_items
for each row execute function public.reject_fleet_bootstrap_mutation();

create trigger fleet_membership_bootstrap_seals_append_only_update
before update on public.fleet_membership_bootstrap_seals
for each row execute function public.reject_fleet_bootstrap_mutation();
create trigger fleet_membership_bootstrap_seals_append_only_delete
before delete on public.fleet_membership_bootstrap_seals
for each row execute function public.reject_fleet_bootstrap_mutation();

create trigger fleet_membership_bootstrap_applications_append_only_update
before update on public.fleet_membership_bootstrap_applications
for each row execute function public.reject_fleet_bootstrap_mutation();
create trigger fleet_membership_bootstrap_applications_append_only_delete
before delete on public.fleet_membership_bootstrap_applications
for each row execute function public.reject_fleet_bootstrap_mutation();

create trigger fleet_membership_bootstrap_item_applications_append_only_update
before update on public.fleet_membership_bootstrap_item_applications
for each row execute function public.reject_fleet_bootstrap_mutation();
create trigger fleet_membership_bootstrap_item_applications_append_only_delete
before delete on public.fleet_membership_bootstrap_item_applications
for each row execute function public.reject_fleet_bootstrap_mutation();

create or replace function public.lock_fleet_bootstrap_batch(p_batch_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  select pg_advisory_xact_lock(hashtextextended('FLEET_BOOTSTRAP_BATCH:' || p_batch_id::text, 0));
$$;

create or replace function public.compute_fleet_bootstrap_manifest_hash(p_batch_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
    'batch_key', b.batch_key,
    'revision_no', b.revision_no,
    't0', b.t0,
    'scope', b.scope,
    'coverage_mode', b.coverage_mode,
    'source_system', b.source_system,
    'source_entity', b.source_entity,
    'source_record_id', b.source_record_id,
    'source_event_id', b.source_event_id,
    'evidence', b.evidence,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'item_key', i.item_key,
          'identity_id', i.identity_id,
          'membership_state', i.membership_state,
          'resolution_reason', i.resolution_reason,
          'regnr_snapshot', i.regnr_snapshot,
          'vin_snapshot', i.vin_snapshot,
          'source_system', i.source_system,
          'source_entity', i.source_entity,
          'source_record_id', i.source_record_id,
          'source_event_id', i.source_event_id,
          'verifier_source', i.verifier_source,
          'verifier_name', i.verifier_name,
          'verifier_email', i.verifier_email,
          'verified_at', i.verified_at,
          'evidence', i.evidence
        ) order by i.item_key
      )
      from public.fleet_membership_bootstrap_items i
      where i.batch_id = b.batch_id
    ), '[]'::jsonb)
  ) into v_payload
  from public.fleet_membership_bootstrap_batches b
  where b.batch_id = p_batch_id;

  if v_payload is null then
    raise exception 'unknown bootstrap batch %', p_batch_id;
  end if;

  return md5(v_payload::text);
end;
$$;

create or replace function public.create_fleet_membership_bootstrap_batch(
  p_batch_key text,
  p_revision_no integer,
  p_t0 timestamptz,
  p_coverage_mode text,
  p_source_system text,
  p_source_entity text,
  p_source_record_id text default null,
  p_source_event_id text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_batch_id uuid;
  v_existing public.fleet_membership_bootstrap_batches%rowtype;
begin
  if coalesce(length(trim(p_batch_key)), 0) = 0 then raise exception 'batch_key is required'; end if;
  if p_revision_no is null or p_revision_no <= 0 then raise exception 'revision_no must be positive'; end if;
  if p_t0 is null then raise exception 'T0 is required'; end if;
  if p_coverage_mode not in ('PARTIAL', 'COMPLETE_ACTIVE_POPULATION') then raise exception 'invalid bootstrap coverage mode'; end if;
  if coalesce(length(trim(p_source_system)), 0) = 0 or coalesce(length(trim(p_source_entity)), 0) = 0 then raise exception 'bootstrap source identity is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('FLEET_BOOTSTRAP_REVISION:' || trim(p_batch_key) || ':' || p_revision_no::text, 0));

  select * into v_existing
  from public.fleet_membership_bootstrap_batches b
  where b.batch_key = trim(p_batch_key) and b.revision_no = p_revision_no;

  if found then
    if v_existing.t0 is not distinct from p_t0
       and v_existing.coverage_mode is not distinct from p_coverage_mode
       and v_existing.source_system is not distinct from p_source_system
       and v_existing.source_entity is not distinct from p_source_entity
       and v_existing.source_record_id is not distinct from p_source_record_id
       and v_existing.source_event_id is not distinct from p_source_event_id
       and v_existing.evidence is not distinct from coalesce(p_evidence, '{}'::jsonb) then
      return v_existing.batch_id;
    end if;
    raise exception 'BOOTSTRAP_REVISION_CONFLICT: batch key/revision already exists with different payload';
  end if;

  insert into public.fleet_membership_bootstrap_batches (
    batch_key, revision_no, t0, coverage_mode,
    source_system, source_entity, source_record_id, source_event_id, evidence
  ) values (
    trim(p_batch_key), p_revision_no, p_t0, p_coverage_mode,
    p_source_system, p_source_entity, p_source_record_id, p_source_event_id, coalesce(p_evidence, '{}'::jsonb)
  ) returning batch_id into v_batch_id;

  return v_batch_id;
end;
$$;

create or replace function public.add_fleet_membership_bootstrap_item(
  p_batch_id uuid,
  p_item_key text,
  p_identity_id uuid,
  p_membership_state text,
  p_resolution_reason text,
  p_regnr text,
  p_vin text,
  p_source_system text,
  p_source_entity text,
  p_verifier_name text,
  p_verified_at timestamptz,
  p_source_record_id text default null,
  p_source_event_id text default null,
  p_verifier_email text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item_id uuid;
  v_regnr text := null;
  v_vin text := null;
  v_existing public.fleet_membership_bootstrap_items%rowtype;
begin
  if coalesce(length(trim(p_item_key)), 0) = 0 then raise exception 'item_key is required'; end if;
  if p_membership_state not in ('ACTIVE', 'INACTIVE', 'UNKNOWN') then raise exception 'invalid bootstrap membership state'; end if;
  if p_resolution_reason not in ('RESOLVED', 'NO_CANONICAL_IDENTITY', 'IDENTITY_CONFLICT') then raise exception 'invalid bootstrap resolution reason'; end if;
  if coalesce(length(trim(p_source_system)), 0) = 0 or coalesce(length(trim(p_source_entity)), 0) = 0 then raise exception 'item source identity is required'; end if;
  if coalesce(length(trim(p_verifier_name)), 0) = 0 or p_verified_at is null then raise exception 'Bilkontroll verifier is required'; end if;

  if p_regnr is not null and length(trim(p_regnr)) > 0 then v_regnr := public.normalize_fleet_regnr(p_regnr); end if;
  if p_vin is not null and length(trim(p_vin)) > 0 then v_vin := public.normalize_fleet_vin(p_vin); end if;
  if v_regnr is null and v_vin is null then raise exception 'bootstrap item requires regnr or VIN evidence'; end if;

  perform public.lock_fleet_bootstrap_batch(p_batch_id);
  if not exists (select 1 from public.fleet_membership_bootstrap_batches where batch_id = p_batch_id) then raise exception 'unknown bootstrap batch %', p_batch_id; end if;
  if exists (select 1 from public.fleet_membership_bootstrap_seals where batch_id = p_batch_id) then raise exception 'BOOTSTRAP_REVISION_SEALED: items cannot be added after verification'; end if;

  if p_identity_id is not null then
    if p_resolution_reason <> 'RESOLVED' then raise exception 'resolved identity requires RESOLVED reason'; end if;
    if not exists (select 1 from public.fleet_vehicle_identities where identity_id = p_identity_id) then raise exception 'unknown canonical identity %', p_identity_id; end if;
    if v_vin is not null and not exists (
      select 1 from public.fleet_vehicle_identity_aliases a where a.identity_id = p_identity_id and a.alias_type = 'VIN' and a.alias_value = v_vin
    ) then raise exception 'BOOTSTRAP_IDENTITY_EVIDENCE_MISMATCH: VIN does not belong to canonical identity'; end if;
    if v_regnr is not null and not exists (
      select 1 from public.fleet_vehicle_identity_aliases a where a.identity_id = p_identity_id and a.alias_type = 'REGNR' and a.alias_value = v_regnr
    ) then raise exception 'BOOTSTRAP_IDENTITY_EVIDENCE_MISMATCH: REGNR does not belong to canonical identity'; end if;
  else
    if p_membership_state <> 'UNKNOWN' or p_resolution_reason not in ('NO_CANONICAL_IDENTITY', 'IDENTITY_CONFLICT') then
      raise exception 'unresolved bootstrap item must remain UNKNOWN with explicit unresolved reason';
    end if;
  end if;

  select * into v_existing
  from public.fleet_membership_bootstrap_items i
  where i.batch_id = p_batch_id and i.item_key = trim(p_item_key);

  if found then
    if v_existing.identity_id is not distinct from p_identity_id
       and v_existing.membership_state is not distinct from p_membership_state
       and v_existing.resolution_reason is not distinct from p_resolution_reason
       and v_existing.regnr_snapshot is not distinct from v_regnr
       and v_existing.vin_snapshot is not distinct from v_vin
       and v_existing.source_system is not distinct from p_source_system
       and v_existing.source_entity is not distinct from p_source_entity
       and v_existing.source_record_id is not distinct from p_source_record_id
       and v_existing.source_event_id is not distinct from p_source_event_id
       and v_existing.verifier_name is not distinct from p_verifier_name
       and v_existing.verifier_email is not distinct from p_verifier_email
       and v_existing.verified_at is not distinct from p_verified_at
       and v_existing.evidence is not distinct from coalesce(p_evidence, '{}'::jsonb) then
      return v_existing.item_id;
    end if;
    raise exception 'BOOTSTRAP_ITEM_CONFLICT: item key already exists with different verified payload';
  end if;

  insert into public.fleet_membership_bootstrap_items (
    batch_id, item_key, identity_id, membership_state, resolution_reason,
    regnr_snapshot, vin_snapshot, source_system, source_entity, source_record_id, source_event_id,
    verifier_name, verifier_email, verified_at, evidence
  ) values (
    p_batch_id, trim(p_item_key), p_identity_id, p_membership_state, p_resolution_reason,
    v_regnr, v_vin, p_source_system, p_source_entity, p_source_record_id, p_source_event_id,
    p_verifier_name, p_verifier_email, p_verified_at, coalesce(p_evidence, '{}'::jsonb)
  ) returning item_id into v_item_id;

  return v_item_id;
end;
$$;

create or replace function public.seal_fleet_membership_bootstrap_batch(
  p_batch_id uuid,
  p_verifier_name text,
  p_verified_at timestamptz,
  p_verifier_email text default null,
  p_attestation_text text default null,
  p_verification_evidence jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_batch public.fleet_membership_bootstrap_batches%rowtype;
  v_existing public.fleet_membership_bootstrap_seals%rowtype;
  v_manifest_hash text;
  v_revision_hash text;
  v_complete boolean := false;
  v_attestation_constant constant text := 'Denna population är komplett för OWN_FLEET ACTIVE vid T0.';
begin
  if coalesce(length(trim(p_verifier_name)), 0) = 0 or p_verified_at is null then raise exception 'Bilkontroll verifier is required'; end if;
  perform public.lock_fleet_bootstrap_batch(p_batch_id);

  select * into v_batch from public.fleet_membership_bootstrap_batches where batch_id = p_batch_id;
  if not found then raise exception 'unknown bootstrap batch %', p_batch_id; end if;

  if v_batch.coverage_mode = 'COMPLETE_ACTIVE_POPULATION' then
    if p_attestation_text is distinct from v_attestation_constant then
      raise exception 'BOOTSTRAP_COMPLETENESS_ATTESTATION_REQUIRED: exact Bilkontroll attestation is required';
    end if;
    v_complete := true;
  else
    if p_attestation_text is not null then
      raise exception 'PARTIAL bootstrap cannot carry COMPLETE_ACTIVE_POPULATION attestation';
    end if;
  end if;

  v_manifest_hash := public.compute_fleet_bootstrap_manifest_hash(p_batch_id);
  v_revision_hash := md5(jsonb_build_object(
    'manifest_hash', v_manifest_hash,
    'verifier_source', 'BILKONTROLL',
    'verifier_name', p_verifier_name,
    'verifier_email', p_verifier_email,
    'verified_at', p_verified_at,
    'attestation_text', p_attestation_text,
    'verification_evidence', coalesce(p_verification_evidence, '{}'::jsonb)
  )::text);

  select * into v_existing from public.fleet_membership_bootstrap_seals where batch_id = p_batch_id;
  if found then
    if v_existing.manifest_hash = v_manifest_hash
       and v_existing.revision_hash = v_revision_hash
       and v_existing.verifier_name is not distinct from p_verifier_name
       and v_existing.verifier_email is not distinct from p_verifier_email
       and v_existing.verified_at is not distinct from p_verified_at
       and v_existing.attestation_text is not distinct from p_attestation_text
       and v_existing.verification_evidence is not distinct from coalesce(p_verification_evidence, '{}'::jsonb) then
      return v_existing.revision_hash;
    end if;
    raise exception 'BOOTSTRAP_SEAL_CONFLICT: verified batch revision is immutable';
  end if;

  insert into public.fleet_membership_bootstrap_seals (
    batch_id, manifest_hash, revision_hash,
    verifier_name, verifier_email, verified_at,
    attestation_text, verification_evidence, complete_active_population_attested
  ) values (
    p_batch_id, v_manifest_hash, v_revision_hash,
    p_verifier_name, p_verifier_email, p_verified_at,
    p_attestation_text, coalesce(p_verification_evidence, '{}'::jsonb), v_complete
  );

  return v_revision_hash;
end;
$$;

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

  perform public.lock_fleet_bootstrap_batch(p_batch_id);
  select * into v_batch from public.fleet_membership_bootstrap_batches where batch_id = p_batch_id;
  if not found then raise exception 'unknown bootstrap batch %', p_batch_id; end if;
  select * into v_seal from public.fleet_membership_bootstrap_seals where batch_id = p_batch_id;
  if not found then raise exception 'BOOTSTRAP_NOT_VERIFIED: batch must be sealed before application'; end if;

  if v_seal.revision_hash <> p_expected_revision_hash then
    raise exception 'BOOTSTRAP_APPLICATION_CONFLICT: expected revision hash does not match verified batch';
  end if;

  v_manifest_now := public.compute_fleet_bootstrap_manifest_hash(p_batch_id);
  if v_manifest_now <> v_seal.manifest_hash then
    raise exception 'BOOTSTRAP_MANIFEST_CHANGED: sealed manifest no longer matches verified hash';
  end if;

  select * into v_existing from public.fleet_membership_bootstrap_applications where batch_id = p_batch_id;
  if found then
    if v_existing.revision_hash = p_expected_revision_hash and v_existing.manifest_hash = v_seal.manifest_hash then
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
    select i.* from public.fleet_membership_bootstrap_items i
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

create or replace view public.fleet_membership_bootstrap_batch_status
with (security_invoker = true)
as
select
  b.batch_id,
  b.batch_key,
  b.revision_no,
  b.t0,
  b.scope,
  b.coverage_mode,
  s.manifest_hash,
  s.revision_hash,
  (s.batch_id is not null) as verified,
  coalesce(s.complete_active_population_attested, false) as complete_active_population_attested,
  a.application_id,
  a.applied_at,
  count(i.item_id) as item_count,
  count(i.item_id) filter (where i.membership_state = 'ACTIVE') as active_count,
  count(i.item_id) filter (where i.membership_state = 'INACTIVE') as inactive_count,
  count(i.item_id) filter (where i.membership_state = 'UNKNOWN') as unknown_count,
  count(i.item_id) filter (where i.identity_id is null) as unresolved_count,
  (
    b.coverage_mode = 'COMPLETE_ACTIVE_POPULATION'
    and coalesce(s.complete_active_population_attested, false)
    and count(i.item_id) filter (where i.identity_id is null) = 0
    and a.application_id is not null
  ) as bootstrap_denominator_eligible,
  false as consumer_cutover_ready
from public.fleet_membership_bootstrap_batches b
left join public.fleet_membership_bootstrap_seals s on s.batch_id = b.batch_id
left join public.fleet_membership_bootstrap_applications a on a.batch_id = b.batch_id
left join public.fleet_membership_bootstrap_items i on i.batch_id = b.batch_id
group by b.batch_id, s.batch_id, s.manifest_hash, s.revision_hash, s.complete_active_population_attested, a.application_id, a.applied_at;

alter table public.fleet_membership_bootstrap_batches enable row level security;
alter table public.fleet_membership_bootstrap_items enable row level security;
alter table public.fleet_membership_bootstrap_seals enable row level security;
alter table public.fleet_membership_bootstrap_applications enable row level security;
alter table public.fleet_membership_bootstrap_item_applications enable row level security;

revoke all on public.fleet_membership_bootstrap_batches from public, anon, authenticated, service_role;
revoke all on public.fleet_membership_bootstrap_items from public, anon, authenticated, service_role;
revoke all on public.fleet_membership_bootstrap_seals from public, anon, authenticated, service_role;
revoke all on public.fleet_membership_bootstrap_applications from public, anon, authenticated, service_role;
revoke all on public.fleet_membership_bootstrap_item_applications from public, anon, authenticated, service_role;
revoke all on public.fleet_membership_bootstrap_batch_status from public, anon, authenticated, service_role;

revoke execute on function public.reject_fleet_bootstrap_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.enforce_fleet_bootstrap_item_insert() from public, anon, authenticated, service_role;
revoke execute on function public.lock_fleet_bootstrap_batch(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.compute_fleet_bootstrap_manifest_hash(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.create_fleet_membership_bootstrap_batch(text,integer,timestamptz,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.add_fleet_membership_bootstrap_item(uuid,text,uuid,text,text,text,text,text,text,text,timestamptz,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.seal_fleet_membership_bootstrap_batch(uuid,text,timestamptz,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.apply_fleet_membership_bootstrap_batch(uuid,text,text,timestamptz,text) from public, anon, authenticated;

grant select on public.fleet_membership_bootstrap_batches to service_role;
grant select on public.fleet_membership_bootstrap_items to service_role;
grant select on public.fleet_membership_bootstrap_seals to service_role;
grant select on public.fleet_membership_bootstrap_applications to service_role;
grant select on public.fleet_membership_bootstrap_item_applications to service_role;
grant select on public.fleet_membership_bootstrap_batch_status to service_role;

grant execute on function public.create_fleet_membership_bootstrap_batch(text,integer,timestamptz,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.add_fleet_membership_bootstrap_item(uuid,text,uuid,text,text,text,text,text,text,text,timestamptz,text,text,text,jsonb) to service_role;
grant execute on function public.seal_fleet_membership_bootstrap_batch(uuid,text,timestamptz,text,text,jsonb) to service_role;
grant execute on function public.apply_fleet_membership_bootstrap_batch(uuid,text,text,timestamptz,text) to service_role;

comment on table public.fleet_membership_bootstrap_batches is 'Immutable Manual Bootstrap batch revisions for canonical OWN_FLEET membership V1. Build Step 2 only.';
comment on table public.fleet_membership_bootstrap_items is 'Per-vehicle current-state T0 verification manifest. Unresolved objects remain explicit UNKNOWN rows and are never inferred away.';
comment on table public.fleet_membership_bootstrap_seals is 'Immutable Bilkontroll verification seal containing deterministic manifest/revision hashes and optional COMPLETE_ACTIVE_POPULATION attestation.';
comment on function public.apply_fleet_membership_bootstrap_batch(uuid,text,text,timestamptz,text) is 'Applies only explicit resolved T0 states through the canonical membership foundation. Existing matching modern state is confirmed, not overwritten. Absence never creates INACTIVE.';
comment on view public.fleet_membership_bootstrap_batch_status is 'Bootstrap audit/read status. PARTIAL is never denominator-eligible. Step 2 never marks consumer cutover ready.';

commit;
