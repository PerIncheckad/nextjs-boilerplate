begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- CANONICAL FLEET MEMBERSHIP V1 / BUILD STEP 1
-- Foundation only. No bootstrap, consumer cutover, Nybil write-through or AVVECKLA write-through.

create table public.fleet_vehicle_identities (
  identity_id uuid primary key default gen_random_uuid(),
  identity_scope text not null default 'OWN_FLEET'
    check (identity_scope = 'OWN_FLEET'),
  created_at timestamptz not null default now()
);

create table public.fleet_vehicle_identity_aliases (
  alias_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.fleet_vehicle_identities(identity_id) on delete restrict,
  alias_type text not null check (alias_type in ('VIN', 'REGNR')),
  alias_value text not null check (length(trim(alias_value)) > 0),
  effective_at timestamptz not null,
  source_system text not null check (length(trim(source_system)) > 0),
  source_entity text not null check (length(trim(source_entity)) > 0),
  source_record_id text,
  source_event_id text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (identity_id, alias_type, alias_value)
);

-- VIN is stable identity when verified. REGNR is an append-only alias and is not globally unique.
create unique index fleet_vehicle_identity_aliases_vin_uidx
  on public.fleet_vehicle_identity_aliases (alias_value)
  where alias_type = 'VIN';

create index fleet_vehicle_identity_aliases_regnr_idx
  on public.fleet_vehicle_identity_aliases (alias_value, identity_id)
  where alias_type = 'REGNR';

create table public.fleet_membership_facts (
  fact_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.fleet_vehicle_identities(identity_id) on delete restrict,
  scope text not null default 'OWN_FLEET' check (scope = 'OWN_FLEET'),
  membership_state text not null check (membership_state in ('ACTIVE', 'INACTIVE', 'UNKNOWN')),
  basis text not null check (basis in ('CURRENT_BASELINE', 'ENTRY', 'EXIT', 'CORRECTION')),
  effective_at timestamptz not null,
  verified_at timestamptz not null default now(),
  source_system text not null check (length(trim(source_system)) > 0),
  source_entity text not null check (length(trim(source_entity)) > 0),
  source_record_id text,
  source_event_id text,
  actor_id uuid,
  actor_source text not null default 'SYSTEM'
    check (actor_source in ('SYSTEM', 'MANUELL', 'EXTERNAL')),
  actor_name text,
  actor_email text,
  evidence jsonb not null default '{}'::jsonb,
  correction_of_fact_id uuid references public.fleet_membership_facts(fact_id) on delete restrict,
  created_at timestamptz not null default now(),
  check (basis <> 'ENTRY' or membership_state = 'ACTIVE'),
  check (basis <> 'EXIT' or membership_state = 'INACTIVE'),
  check (basis = 'CORRECTION' or correction_of_fact_id is null),
  check (basis <> 'CORRECTION' or correction_of_fact_id is not null)
);

create unique index fleet_membership_facts_source_event_uidx
  on public.fleet_membership_facts (source_system, source_entity, source_event_id)
  where source_event_id is not null;

create index fleet_membership_facts_identity_effective_idx
  on public.fleet_membership_facts (identity_id, effective_at, fact_id);

-- A fact may supersede one canonical head, or multiple heads when CORRECTION resolves a branch.
create table public.fleet_membership_fact_predecessors (
  fact_id uuid not null references public.fleet_membership_facts(fact_id) on delete restrict,
  predecessor_fact_id uuid not null references public.fleet_membership_facts(fact_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (fact_id, predecessor_fact_id),
  check (fact_id <> predecessor_fact_id)
);

create index fleet_membership_fact_predecessors_reverse_idx
  on public.fleet_membership_fact_predecessors (predecessor_fact_id, fact_id);

create or replace function public.reject_fleet_membership_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'canonical fleet membership is append-only';
end;
$$;

create trigger fleet_vehicle_identities_append_only_update
before update on public.fleet_vehicle_identities
for each row execute function public.reject_fleet_membership_mutation();
create trigger fleet_vehicle_identities_append_only_delete
before delete on public.fleet_vehicle_identities
for each row execute function public.reject_fleet_membership_mutation();
create trigger fleet_vehicle_identity_aliases_append_only_update
before update on public.fleet_vehicle_identity_aliases
for each row execute function public.reject_fleet_membership_mutation();
create trigger fleet_vehicle_identity_aliases_append_only_delete
before delete on public.fleet_vehicle_identity_aliases
for each row execute function public.reject_fleet_membership_mutation();
create trigger fleet_membership_facts_append_only_update
before update on public.fleet_membership_facts
for each row execute function public.reject_fleet_membership_mutation();
create trigger fleet_membership_facts_append_only_delete
before delete on public.fleet_membership_facts
for each row execute function public.reject_fleet_membership_mutation();
create trigger fleet_membership_fact_predecessors_append_only_update
before update on public.fleet_membership_fact_predecessors
for each row execute function public.reject_fleet_membership_mutation();
create trigger fleet_membership_fact_predecessors_append_only_delete
before delete on public.fleet_membership_fact_predecessors
for each row execute function public.reject_fleet_membership_mutation();

create or replace function public.normalize_fleet_regnr(p_regnr text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select upper(regexp_replace(trim(p_regnr), '\s+', '', 'g'));
$$;

create or replace function public.normalize_fleet_vin(p_vin text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select upper(regexp_replace(trim(p_vin), '\s+', '', 'g'));
$$;

-- Serializes first creation and later resolution on normalized identity keys.
-- Keys are locked in lexical order to avoid VIN/REGNR deadlocks.
create or replace function public.lock_fleet_identity_keys(
  p_normalized_regnr text,
  p_normalized_vin text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_key text;
begin
  for v_key in
    select k.identity_key
    from (
      values
        (case when p_normalized_regnr is not null then 'REGNR:' || p_normalized_regnr end),
        (case when p_normalized_vin is not null then 'VIN:' || p_normalized_vin end)
    ) as k(identity_key)
    where k.identity_key is not null
    order by k.identity_key
  loop
    perform pg_advisory_xact_lock(hashtextextended('FLEET_IDENTITY:' || v_key, 0));
  end loop;
end;
$$;

create or replace function public.create_fleet_vehicle_identity(
  p_regnr text,
  p_vin text,
  p_effective_at timestamptz,
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
  v_regnr text := null;
  v_vin text := null;
  v_vin_identity uuid;
  v_reg_identity uuid;
  v_reg_ids uuid[] := '{}'::uuid[];
  v_identity_id uuid;
begin
  if p_regnr is not null and length(trim(p_regnr)) > 0 then
    v_regnr := public.normalize_fleet_regnr(p_regnr);
  end if;
  if p_vin is not null and length(trim(p_vin)) > 0 then
    v_vin := public.normalize_fleet_vin(p_vin);
  end if;

  if v_regnr is null and v_vin is null then
    raise exception 'fleet identity requires verified regnr or VIN';
  end if;
  if p_effective_at is null then
    raise exception 'effective_at is required';
  end if;
  if coalesce(length(trim(p_source_system)), 0) = 0 or coalesce(length(trim(p_source_entity)), 0) = 0 then
    raise exception 'source identity is required';
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

    if cardinality(v_reg_ids) > 1 then
      raise exception 'IDENTITY_CONFLICT: registration number resolves to multiple canonical identities';
    elsif cardinality(v_reg_ids) = 1 then
      v_reg_identity := v_reg_ids[1];
    end if;
  end if;

  if v_vin is not null and v_regnr is not null then
    if v_vin_identity is not null and v_reg_identity is not null then
      if v_vin_identity <> v_reg_identity then
        raise exception 'IDENTITY_CONFLICT: VIN and registration number belong to different canonical identities';
      end if;
      return v_vin_identity;
    elsif v_vin_identity is not null or v_reg_identity is not null then
      raise exception 'IDENTITY_BINDING_REQUIRED: existing canonical identity requires explicit verified alias binding';
    end if;
  elsif v_vin is not null and v_vin_identity is not null then
    return v_vin_identity;
  elsif v_regnr is not null and v_reg_identity is not null then
    return v_reg_identity;
  end if;

  insert into public.fleet_vehicle_identities default values
  returning identity_id into v_identity_id;

  if v_vin is not null then
    insert into public.fleet_vehicle_identity_aliases (
      identity_id, alias_type, alias_value, effective_at,
      source_system, source_entity, source_record_id, source_event_id, evidence
    ) values (
      v_identity_id, 'VIN', v_vin, p_effective_at,
      p_source_system, p_source_entity, p_source_record_id, p_source_event_id, coalesce(p_evidence, '{}'::jsonb)
    );
  end if;

  if v_regnr is not null then
    insert into public.fleet_vehicle_identity_aliases (
      identity_id, alias_type, alias_value, effective_at,
      source_system, source_entity, source_record_id, source_event_id, evidence
    ) values (
      v_identity_id, 'REGNR', v_regnr, p_effective_at,
      p_source_system, p_source_entity, p_source_record_id, p_source_event_id, coalesce(p_evidence, '{}'::jsonb)
    );
  end if;

  return v_identity_id;
end;
$$;

-- Explicit, verified alias binding. Ordinary create/resolve is forbidden from merging
-- an existing REGNR identity with a later VIN or vice versa.
create or replace function public.bind_fleet_vehicle_identity_alias(
  p_identity_id uuid,
  p_alias_type text,
  p_alias_value text,
  p_effective_at timestamptz,
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
  v_alias_type text;
  v_alias_value text;
  v_existing_ids uuid[] := '{}'::uuid[];
  v_existing_alias_id uuid;
  v_alias_id uuid;
begin
  if p_alias_type is null or upper(trim(p_alias_type)) not in ('VIN', 'REGNR') then
    raise exception 'invalid fleet identity alias type';
  end if;
  v_alias_type := upper(trim(p_alias_type));
  if p_alias_value is null or length(trim(p_alias_value)) = 0 then
    raise exception 'identity alias value is required';
  end if;
  if p_effective_at is null then
    raise exception 'effective_at is required';
  end if;
  if coalesce(length(trim(p_source_system)), 0) = 0 or coalesce(length(trim(p_source_entity)), 0) = 0 then
    raise exception 'source identity is required';
  end if;
  if coalesce(p_evidence, '{}'::jsonb) = '{}'::jsonb
     and p_source_record_id is null
     and p_source_event_id is null then
    raise exception 'verified identity binding requires evidence or source-record provenance';
  end if;

  if v_alias_type = 'VIN' then
    v_alias_value := public.normalize_fleet_vin(p_alias_value);
    perform public.lock_fleet_identity_keys(null, v_alias_value);
  else
    v_alias_value := public.normalize_fleet_regnr(p_alias_value);
    perform public.lock_fleet_identity_keys(v_alias_value, null);
  end if;

  perform 1 from public.fleet_vehicle_identities where identity_id = p_identity_id for update;
  if not found then
    raise exception 'unknown fleet identity %', p_identity_id;
  end if;

  select coalesce(array_agg(distinct a.identity_id order by a.identity_id), '{}'::uuid[])
  into v_existing_ids
  from public.fleet_vehicle_identity_aliases a
  where a.alias_type = v_alias_type and a.alias_value = v_alias_value;

  if v_alias_type = 'VIN'
     and cardinality(v_existing_ids) > 0
     and not (p_identity_id = any(v_existing_ids)) then
    raise exception 'IDENTITY_CONFLICT: VIN is already bound to another canonical identity';
  end if;

  select a.alias_id into v_existing_alias_id
  from public.fleet_vehicle_identity_aliases a
  where a.identity_id = p_identity_id
    and a.alias_type = v_alias_type
    and a.alias_value = v_alias_value;

  if v_existing_alias_id is not null then
    return v_existing_alias_id;
  end if;

  insert into public.fleet_vehicle_identity_aliases (
    identity_id, alias_type, alias_value, effective_at,
    source_system, source_entity, source_record_id, source_event_id, evidence
  ) values (
    p_identity_id, v_alias_type, v_alias_value, p_effective_at,
    p_source_system, p_source_entity, p_source_record_id, p_source_event_id, coalesce(p_evidence, '{}'::jsonb)
  )
  returning alias_id into v_alias_id;

  return v_alias_id;
end;
$$;

create or replace function public.append_fleet_membership_fact(
  p_identity_id uuid,
  p_membership_state text,
  p_basis text,
  p_effective_at timestamptz,
  p_source_system text,
  p_source_entity text,
  p_source_record_id text default null,
  p_source_event_id text default null,
  p_actor_id uuid default null,
  p_actor_source text default 'SYSTEM',
  p_actor_name text default null,
  p_actor_email text default null,
  p_evidence jsonb default '{}'::jsonb,
  p_predecessor_fact_ids uuid[] default '{}'::uuid[],
  p_correction_of_fact_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_fact_id uuid;
  v_existing_fact public.fleet_membership_facts%rowtype;
  v_existing_predecessor_ids uuid[] := '{}'::uuid[];
  v_head_ids uuid[];
  v_head_states text[];
  v_head_count integer;
  v_max_head_effective timestamptz;
  v_supplied_ids uuid[];
begin
  if p_membership_state not in ('ACTIVE', 'INACTIVE', 'UNKNOWN') then
    raise exception 'invalid membership state';
  end if;
  if p_basis not in ('CURRENT_BASELINE', 'ENTRY', 'EXIT', 'CORRECTION') then
    raise exception 'invalid membership basis';
  end if;
  if p_effective_at is null then
    raise exception 'effective_at is required';
  end if;
  if coalesce(length(trim(p_source_system)), 0) = 0 or coalesce(length(trim(p_source_entity)), 0) = 0 then
    raise exception 'source identity is required';
  end if;

  select coalesce(array_agg(x order by x), '{}'::uuid[])
  into v_supplied_ids
  from unnest(coalesce(p_predecessor_fact_ids, '{}'::uuid[])) x;

  if p_source_event_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'FLEET_SOURCE_EVENT:' || p_source_system || ':' || p_source_entity || ':' || p_source_event_id,
        0
      )
    );

    select f.* into v_existing_fact
    from public.fleet_membership_facts f
    where f.source_system = p_source_system
      and f.source_entity = p_source_entity
      and f.source_event_id = p_source_event_id;

    if found then
      select coalesce(array_agg(e.predecessor_fact_id order by e.predecessor_fact_id), '{}'::uuid[])
      into v_existing_predecessor_ids
      from public.fleet_membership_fact_predecessors e
      where e.fact_id = v_existing_fact.fact_id;

      if v_existing_fact.identity_id is not distinct from p_identity_id
         and v_existing_fact.membership_state is not distinct from p_membership_state
         and v_existing_fact.basis is not distinct from p_basis
         and v_existing_fact.effective_at is not distinct from p_effective_at
         and v_existing_fact.correction_of_fact_id is not distinct from p_correction_of_fact_id
         and v_existing_fact.source_record_id is not distinct from p_source_record_id
         and v_existing_predecessor_ids = v_supplied_ids then
        return v_existing_fact.fact_id;
      end if;

      raise exception 'SOURCE_EVENT_CONFLICT: source event id already exists with a different canonical payload';
    end if;
  end if;

  perform 1 from public.fleet_vehicle_identities where identity_id = p_identity_id for update;
  if not found then
    raise exception 'unknown fleet identity %', p_identity_id;
  end if;

  select
    coalesce(array_agg(f.fact_id order by f.fact_id) filter (where f.fact_id is not null), '{}'::uuid[]),
    coalesce(array_agg(f.membership_state order by f.fact_id) filter (where f.fact_id is not null), '{}'::text[]),
    count(f.fact_id),
    max(f.effective_at)
  into v_head_ids, v_head_states, v_head_count, v_max_head_effective
  from public.fleet_membership_facts f
  where f.identity_id = p_identity_id
    and not exists (
      select 1 from public.fleet_membership_fact_predecessors e
      where e.predecessor_fact_id = f.fact_id
    );

  if p_basis = 'CURRENT_BASELINE' then
    if v_head_count <> 0 then
      raise exception 'CURRENT_BASELINE requires no existing canonical head';
    end if;
    if cardinality(v_supplied_ids) <> 0 then
      raise exception 'CURRENT_BASELINE cannot have predecessors';
    end if;
  elsif p_basis = 'ENTRY' then
    if p_membership_state <> 'ACTIVE' then
      raise exception 'ENTRY must produce ACTIVE';
    end if;
    if v_head_count = 0 then
      if cardinality(v_supplied_ids) <> 0 then
        raise exception 'initial ENTRY cannot have predecessors';
      end if;
    elsif v_head_count = 1 then
      if v_supplied_ids <> v_head_ids then
        raise exception 'ENTRY predecessor is not current canonical head';
      end if;
      if v_head_states[1] = 'ACTIVE' then
        raise exception 'ENTRY cannot transition ACTIVE to ACTIVE';
      end if;
      if p_effective_at < v_max_head_effective then
        raise exception 'ENTRY effective_at predates current canonical head';
      end if;
    else
      raise exception 'FACT_CONFLICT requires CORRECTION before ENTRY';
    end if;
  elsif p_basis = 'EXIT' then
    if p_membership_state <> 'INACTIVE' then
      raise exception 'EXIT must produce INACTIVE';
    end if;
    if v_head_count <> 1 or v_head_states[1] <> 'ACTIVE' then
      raise exception 'EXIT requires exactly one ACTIVE canonical head';
    end if;
    if v_supplied_ids <> v_head_ids then
      raise exception 'EXIT predecessor is not current canonical head';
    end if;
    if p_effective_at < v_max_head_effective then
      raise exception 'EXIT effective_at predates current canonical head';
    end if;
  else
    if v_head_count = 0 then
      raise exception 'CORRECTION requires existing canonical fact';
    end if;
    if v_supplied_ids <> v_head_ids then
      raise exception 'CORRECTION must supersede every current head';
    end if;
    if p_correction_of_fact_id is null then
      raise exception 'CORRECTION requires correction_of_fact_id';
    end if;
    if not exists (
      select 1 from public.fleet_membership_facts f
      where f.fact_id = p_correction_of_fact_id and f.identity_id = p_identity_id
    ) then
      raise exception 'correction target is not a fact for this identity';
    end if;
    if p_effective_at < v_max_head_effective then
      raise exception 'CORRECTION effective_at predates current canonical head';
    end if;
  end if;

  insert into public.fleet_membership_facts (
    identity_id, membership_state, basis, effective_at,
    source_system, source_entity, source_record_id, source_event_id,
    actor_id, actor_source, actor_name, actor_email, evidence, correction_of_fact_id
  ) values (
    p_identity_id, p_membership_state, p_basis, p_effective_at,
    p_source_system, p_source_entity, p_source_record_id, p_source_event_id,
    p_actor_id, p_actor_source, p_actor_name, p_actor_email, coalesce(p_evidence, '{}'::jsonb), p_correction_of_fact_id
  ) returning fact_id into v_fact_id;

  insert into public.fleet_membership_fact_predecessors (fact_id, predecessor_fact_id)
  select v_fact_id, x from unnest(v_supplied_ids) x;

  return v_fact_id;
end;
$$;

create or replace view public.fleet_membership_current_by_identity
with (security_invoker = true)
as
with heads as (
  select f.*
  from public.fleet_membership_facts f
  where not exists (
    select 1
    from public.fleet_membership_fact_predecessors e
    where e.predecessor_fact_id = f.fact_id
  )
), head_counts as (
  select i.identity_id, count(h.fact_id) as head_count
  from public.fleet_vehicle_identities i
  left join heads h on h.identity_id = i.identity_id
  group by i.identity_id
)
select
  c.identity_id,
  case
    when c.head_count = 0 then 'UNKNOWN'
    when c.head_count = 1 then h.membership_state
    else 'UNKNOWN'
  end as membership_state,
  case
    when c.head_count = 0 then 'NO_FACT'
    when c.head_count = 1 then 'RESOLVED'
    else 'FACT_CONFLICT'
  end as resolution_reason,
  case when c.head_count = 1 then h.fact_id else null end as membership_fact_id,
  case when c.head_count = 1 then h.basis else null end as basis,
  case when c.head_count = 1 then h.effective_at else null end as effective_at,
  case when c.head_count = 1 then h.verified_at else null end as verified_at,
  case when c.head_count = 1 then h.source_system else null end as source_system,
  case when c.head_count = 1 then h.source_entity else null end as source_entity,
  case when c.head_count = 1 then h.source_record_id else null end as source_record_id,
  case when c.head_count = 1 then h.source_event_id else null end as source_event_id,
  case when c.head_count = 1 then h.evidence else null end as evidence
from head_counts c
left join heads h on h.identity_id = c.identity_id and c.head_count = 1;

create or replace function public.get_fleet_membership(
  p_regnr text default null,
  p_vin text default null
)
returns table (
  identity_id uuid,
  membership_state text,
  resolution_reason text,
  membership_fact_id uuid,
  basis text,
  effective_at timestamptz,
  verified_at timestamptz,
  source_system text,
  source_entity text,
  source_record_id text,
  source_event_id text,
  evidence jsonb
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_regnr text := null;
  v_vin text := null;
  v_vin_identity uuid;
  v_reg_ids uuid[] := '{}'::uuid[];
  v_identity uuid;
begin
  if p_regnr is not null and length(trim(p_regnr)) > 0 then
    v_regnr := public.normalize_fleet_regnr(p_regnr);
  end if;
  if p_vin is not null and length(trim(p_vin)) > 0 then
    v_vin := public.normalize_fleet_vin(p_vin);
  end if;

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

  if v_vin_identity is not null then
    if cardinality(v_reg_ids) > 0 and not (v_vin_identity = any(v_reg_ids)) then
      return query select null::uuid, 'UNKNOWN'::text, 'IDENTITY_CONFLICT'::text,
        null::uuid, null::text, null::timestamptz, null::timestamptz,
        null::text, null::text, null::text, null::text, null::jsonb;
      return;
    end if;
    v_identity := v_vin_identity;
  elsif v_vin is not null and cardinality(v_reg_ids) > 0 then
    return query select null::uuid, 'UNKNOWN'::text, 'IDENTITY_CONFLICT'::text,
      null::uuid, null::text, null::timestamptz, null::timestamptz,
      null::text, null::text, null::text, null::text, null::jsonb;
    return;
  elsif cardinality(v_reg_ids) = 1 then
    v_identity := v_reg_ids[1];
  elsif cardinality(v_reg_ids) > 1 then
    return query select null::uuid, 'UNKNOWN'::text, 'IDENTITY_CONFLICT'::text,
      null::uuid, null::text, null::timestamptz, null::timestamptz,
      null::text, null::text, null::text, null::text, null::jsonb;
    return;
  else
    return query select null::uuid, 'UNKNOWN'::text, 'NO_FACT'::text,
      null::uuid, null::text, null::timestamptz, null::timestamptz,
      null::text, null::text, null::text, null::text, null::jsonb;
    return;
  end if;

  return query
  select c.identity_id, c.membership_state, c.resolution_reason,
    c.membership_fact_id, c.basis, c.effective_at, c.verified_at,
    c.source_system, c.source_entity, c.source_record_id, c.source_event_id, c.evidence
  from public.fleet_membership_current_by_identity c
  where c.identity_id = v_identity;
end;
$$;

alter table public.fleet_vehicle_identities enable row level security;
alter table public.fleet_vehicle_identity_aliases enable row level security;
alter table public.fleet_membership_facts enable row level security;
alter table public.fleet_membership_fact_predecessors enable row level security;

revoke all on public.fleet_vehicle_identities from public, anon, authenticated, service_role;
revoke all on public.fleet_vehicle_identity_aliases from public, anon, authenticated, service_role;
revoke all on public.fleet_membership_facts from public, anon, authenticated, service_role;
revoke all on public.fleet_membership_fact_predecessors from public, anon, authenticated, service_role;
revoke all on public.fleet_membership_current_by_identity from public, anon, authenticated, service_role;

revoke execute on function public.reject_fleet_membership_mutation() from public, anon, authenticated, service_role;
revoke execute on function public.normalize_fleet_regnr(text) from public, anon, authenticated;
revoke execute on function public.normalize_fleet_vin(text) from public, anon, authenticated;
revoke execute on function public.lock_fleet_identity_keys(text,text) from public, anon, authenticated, service_role;
revoke execute on function public.create_fleet_vehicle_identity(text,text,timestamptz,text,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.bind_fleet_vehicle_identity_alias(uuid,text,text,timestamptz,text,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.append_fleet_membership_fact(uuid,text,text,timestamptz,text,text,text,text,uuid,text,text,text,jsonb,uuid[],uuid) from public, anon, authenticated;
revoke execute on function public.get_fleet_membership(text,text) from public, anon, authenticated;

grant select on public.fleet_vehicle_identities to service_role;
grant select on public.fleet_vehicle_identity_aliases to service_role;
grant select on public.fleet_membership_facts to service_role;
grant select on public.fleet_membership_fact_predecessors to service_role;
grant select on public.fleet_membership_current_by_identity to service_role;

grant execute on function public.normalize_fleet_regnr(text) to service_role;
grant execute on function public.normalize_fleet_vin(text) to service_role;
grant execute on function public.create_fleet_vehicle_identity(text,text,timestamptz,text,text,text,text,jsonb) to service_role;
grant execute on function public.bind_fleet_vehicle_identity_alias(uuid,text,text,timestamptz,text,text,text,text,jsonb) to service_role;
grant execute on function public.append_fleet_membership_fact(uuid,text,text,timestamptz,text,text,text,text,uuid,text,text,text,jsonb,uuid[],uuid) to service_role;
grant execute on function public.get_fleet_membership(text,text) to service_role;

comment on table public.fleet_vehicle_identities is 'Canonical vehicle identity foundation for OWN_FLEET membership V1. Foundation only; not a fleet denominator by itself.';
comment on table public.fleet_membership_facts is 'Append-only canonical OWN_FLEET membership facts. Consumers must use canonical reducer/read contract.';
comment on function public.create_fleet_vehicle_identity(text,text,timestamptz,text,text,text,text,jsonb) is 'Race-safe create/resolve only. Existing identities are never implicitly cross-bound to new aliases.';
comment on function public.bind_fleet_vehicle_identity_alias(uuid,text,text,timestamptz,text,text,text,text,jsonb) is 'Explicit verified append-only identity alias binding. Conflicting bindings are rejected.';
comment on function public.get_fleet_membership(text,text) is 'Canonical membership read contract. UNKNOWN may be fact-backed or unresolved with null fact/source/evidence and explicit resolution_reason.';

commit;
