begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- One shared definition of a still-pending source-owned LEGACY -> Garage UT
-- transition. This is intentionally current-state eligibility only: immutable
-- LEGACY provenance must exist, its exact Layer 1 start must be verifiable, a
-- current Layer 1 period must still exist at/after verification, and the exact
-- LEGACY entry must not already have a dedicated Garage handoff.
create or replace function public.pending_legacy_garage_ut_entry_v1(
  p_regnr text
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select l.entry_id
  from public.vehicle_legacy_current_state_entries l
  where l.normalized_regnr = upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'))
    and l.object_type = 'LEGACY_FLEET'
    and l.historical_backfill = false
    and exists (
      select 1
      from public.vehicle_journey_periods p0
      where upper(regexp_replace(p0.regnr, '\s+', '', 'g')) = l.normalized_regnr
        and p0.source_entity = 'vehicle_legacy_current_state_entries'
        and p0.source_record_id = l.entry_id::text
        and p0.started_at = l.verified_at
    )
    and exists (
      select 1
      from public.vehicle_journey_periods pc
      where upper(regexp_replace(pc.regnr, '\s+', '', 'g')) = l.normalized_regnr
        and pc.ended_at is null
        and pc.started_at >= l.verified_at
    )
    and not exists (
      select 1
      from public.garage_legacy_handoffs h
      where h.legacy_entry_id = l.entry_id
    )
  limit 1;
$$;

revoke all on function public.pending_legacy_garage_ut_entry_v1(text)
  from public, anon, authenticated, service_role;

comment on function public.pending_legacy_garage_ut_entry_v1(text) is
  'Shared current-state eligibility for one still-pending source-owned LEGACY_FLEET -> Garage UT transition. Never historical backfill.';

-- Canonical recipient identity for dedicated LEGACY handoffs. This is used by
-- the authoritative void boundary and by the API capability read model.
create or replace function public.is_canonical_legacy_garage_recipient_v1(
  p_garage_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.garage_legacy_handoffs h
    join public.garage_items g
      on g.garage_item_id = h.garage_item_id
    join public.vehicle_legacy_current_state_entries l
      on l.entry_id = h.legacy_entry_id
    where h.garage_item_id = p_garage_item_id
      and h.handoff_type = 'LEGACY_FLEET_TO_GARAGE_UT'
      and h.historical_backfill = false
      and l.object_type = 'LEGACY_FLEET'
      and l.historical_backfill = false
      and g.source_kind = 'LAGER1'
      and g.source_legacy_entry_id = h.legacy_entry_id
      and g.source_journey_period_id = h.journey_period_id
      and g.garage_direction = 'UT'
      and upper(regexp_replace(coalesce(g.regnr, ''), '\s+', '', 'g')) = l.normalized_regnr
      and upper(regexp_replace(coalesce(h.regnr, ''), '\s+', '', 'g')) = l.normalized_regnr
  );
$$;

revoke all on function public.is_canonical_legacy_garage_recipient_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.is_canonical_legacy_garage_recipient_v1(uuid)
  to service_role;

comment on function public.is_canonical_legacy_garage_recipient_v1(uuid) is
  'True only for the exact Garage recipient bound to an immutable dedicated LEGACY_FLEET -> Garage UT handoff.';

-- Pending LEGACY owns the next Garage UT transition. The ordinary MANUELL path
-- must not preempt that source-owned transition. This intentionally does not
-- block future ordinary Garage UT work once the exact LEGACY entry has been
-- consumed by its dedicated handoff.
create or replace function public.guard_pending_legacy_manual_garage_ut_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text := upper(regexp_replace(coalesce(new.regnr, ''), '\s+', '', 'g'));
  v_source_regnr text := upper(regexp_replace(coalesce(new.source_regnr, ''), '\s+', '', 'g'));
begin
  if new.source_kind = 'MANUELL' and new.garage_direction = 'UT' then
    if (v_regnr <> '' and public.pending_legacy_garage_ut_entry_v1(v_regnr) is not null)
       or (v_source_regnr <> '' and public.pending_legacy_garage_ut_entry_v1(v_source_regnr) is not null) then
      raise exception 'Pending verifierad LEGACY_FLEET äger nästa Garage UT-handslag; MANUELL UT är inte tillåten'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_pending_legacy_manual_garage_ut_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists garage_items_pending_legacy_manual_ut_guard_v1 on public.garage_items;
create trigger garage_items_pending_legacy_manual_ut_guard_v1
before insert on public.garage_items
for each row execute function public.guard_pending_legacy_manual_garage_ut_v1();

-- The dedicated handoff table is a runtime read model plus canonical-writer
-- target, not a runtime DML surface. SECURITY DEFINER canonical writer remains
-- able to insert as owner; service_role keeps SELECT only.
revoke all privileges on table public.garage_legacy_handoffs
  from public, anon, authenticated, service_role;
grant select on table public.garage_legacy_handoffs to service_role;

create or replace function public.guard_garage_legacy_handoff_insert_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if current_user <> 'postgres' then
    raise exception 'garage_legacy_handoffs kan endast skapas av canonical LEGACY-writer'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_garage_legacy_handoff_insert_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists garage_legacy_handoffs_canonical_insert_v1 on public.garage_legacy_handoffs;
create trigger garage_legacy_handoffs_canonical_insert_v1
before insert on public.garage_legacy_handoffs
for each row execute function public.guard_garage_legacy_handoff_insert_v1();

create or replace function public.reject_garage_legacy_handoff_truncate_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'garage_legacy_handoffs historik kan inte trunceras'
    using errcode = 'P0001';
end;
$$;

revoke all on function public.reject_garage_legacy_handoff_truncate_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists garage_legacy_handoffs_reject_truncate_v1 on public.garage_legacy_handoffs;
create trigger garage_legacy_handoffs_reject_truncate_v1
before truncate on public.garage_legacy_handoffs
for each statement execute function public.reject_garage_legacy_handoff_truncate_v1();

-- Canonical writer: exact retry is a pure read of the already-created historical
-- fact. Conflicting request/provenance is rejected. Existing canonical handoff
-- is resolved before active-Garage checks so retry can actually be idempotent.
create or replace function public.materialize_legacy_fleet_to_garage_ut_v1(
  p_legacy_entry_id uuid,
  p_planned_station text,
  p_model_description text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_legacy public.vehicle_legacy_current_state_entries%rowtype;
  v_period public.vehicle_journey_periods%rowtype;
  v_item public.garage_items%rowtype;
  v_handoff public.garage_legacy_handoffs%rowtype;
  v_regnr text;
  v_station text := nullif(trim(coalesce(p_planned_station, '')), '');
  v_actor_email text := nullif(lower(trim(coalesce(p_actor_email, ''))), '');
  v_snapshot_model text;
  v_operator_model text := nullif(trim(coalesce(p_model_description, '')), '');
  v_model text;
  v_model_source text;
  v_now timestamptz := clock_timestamp();
begin
  if p_legacy_entry_id is null then
    raise exception 'LEGACY entry krävs' using errcode = '22023';
  end if;
  if p_actor_id is null or v_actor_email is null then
    raise exception 'Verifierad aktör krävs' using errcode = '22023';
  end if;
  if v_station is null then
    raise exception 'Garage-station för avvecklingsarbetet måste väljas explicit' using errcode = '22023';
  end if;

  select * into v_legacy
  from public.vehicle_legacy_current_state_entries
  where entry_id = p_legacy_entry_id
  for share;

  if not found then
    raise exception 'LEGACY-entryn finns inte' using errcode = 'P0002';
  end if;
  if v_legacy.object_type <> 'LEGACY_FLEET' or v_legacy.historical_backfill then
    raise exception 'Endast verifierad LEGACY_FLEET utan historisk backfill får lämnas till Garage'
      using errcode = 'P0001';
  end if;

  v_regnr := v_legacy.normalized_regnr;
  perform pg_advisory_xact_lock(hashtext('legacy-garage-ut:' || v_regnr));

  v_snapshot_model := nullif(trim(coalesce(
    v_legacy.identity_snapshot #>> '{vehicleCatalogObservation,model}',
    ''
  )), '');

  if v_snapshot_model is not null then
    v_model := v_snapshot_model;
    v_model_source := 'LEGACY_SNAPSHOT';
  else
    v_model := v_operator_model;
    v_model_source := 'MANUELL';
  end if;

  if v_model is null then
    raise exception 'Modell/beskrivning krävs när LEGACY-snapshot saknar modell'
      using errcode = '22023';
  end if;

  -- Exact historical retry must resolve before generic active-Garage checks.
  select * into v_handoff
  from public.garage_legacy_handoffs
  where legacy_entry_id = v_legacy.entry_id;

  if found then
    select * into v_item
    from public.garage_items
    where garage_item_id = v_handoff.garage_item_id
    for share;

    if not found
       or v_handoff.handoff_type <> 'LEGACY_FLEET_TO_GARAGE_UT'
       or v_handoff.historical_backfill
       or upper(regexp_replace(coalesce(v_handoff.regnr, ''), '\s+', '', 'g')) <> v_regnr
       or v_handoff.planned_station is distinct from v_station
       or v_handoff.model_description is distinct from v_model
       or v_handoff.model_source is distinct from v_model_source
       or v_item.source_kind is distinct from 'LAGER1'
       or v_item.source_legacy_entry_id is distinct from v_legacy.entry_id
       or v_item.source_journey_period_id is distinct from v_handoff.journey_period_id
       or upper(regexp_replace(coalesce(v_item.regnr, ''), '\s+', '', 'g')) <> v_regnr
       or v_item.garage_direction is distinct from 'UT'
       or v_item.voided_at is not null then
      raise exception 'LEGACY retry konflikterar med befintlig source/provenance/recipient'
        using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'garageItem', to_jsonb(v_item),
      'handoff', to_jsonb(v_handoff),
      'legacyEntryId', v_legacy.entry_id,
      'journeyPeriodId', v_handoff.journey_period_id,
      'avvecklaStarted', false,
      'historicalBackfill', false
    );
  end if;

  if not exists (
    select 1
    from public.planning_stations
    where station_code = v_station
      and is_active = true
  ) then
    raise exception 'Vald Garage-station är inte en aktiv huvudstation' using errcode = '22023';
  end if;

  if public.pending_legacy_garage_ut_entry_v1(v_regnr) is distinct from v_legacy.entry_id then
    raise exception 'LEGACY-entryn är inte längre en aktuell, ej konsumerad Garage UT-source'
      using errcode = 'P0001';
  end if;

  -- Recheck exact source chronology under the canonical writer lock. The shared
  -- helper above is the ownership definition; these row checks protect races.
  if not exists (
    select 1
    from public.vehicle_journey_periods p
    where upper(regexp_replace(p.regnr, '\s+', '', 'g')) = v_regnr
      and p.source_entity = 'vehicle_legacy_current_state_entries'
      and p.source_record_id = v_legacy.entry_id::text
      and p.started_at = v_legacy.verified_at
  ) then
    raise exception 'LEGACY-proveniens saknar verifierbar Layer 1-start; Garage-handslag stoppat'
      using errcode = 'P0001';
  end if;

  select * into v_period
  from public.vehicle_journey_periods
  where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_regnr
    and ended_at is null
  order by started_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Bilen saknar aktuell Layer 1-period; Garage-handslag stoppat' using errcode = 'P0001';
  end if;
  if v_period.started_at < v_legacy.verified_at then
    raise exception 'Aktuell Layer 1-period föregår LEGACY-verifieringen; Garage-handslag stoppat'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.garage_items gi
    where gi.voided_at is null
      and gi.completed_at is null
      and gi.handed_off_nybil_id is null
      and (
        upper(regexp_replace(coalesce(gi.regnr, ''), '\s+', '', 'g')) = v_regnr
        or upper(regexp_replace(coalesce(gi.source_regnr, ''), '\s+', '', 'g')) = v_regnr
      )
  ) then
    raise exception 'Bilen har redan ett aktivt Garage-objekt' using errcode = 'P0001';
  end if;

  insert into public.garage_items (
    model,
    planning_reason,
    regnr,
    source_regnr,
    planned_station,
    confirmation_status,
    transport_status,
    garage_direction,
    source_kind,
    source_journey_period_id,
    source_journey_event_id,
    source_legacy_entry_id,
    created_at,
    updated_at,
    created_by,
    updated_by
  ) values (
    v_model,
    'ANNAT',
    v_regnr,
    v_regnr,
    v_station,
    'PLANERAD',
    'EJ_BOKAD',
    'UT',
    'LAGER1',
    v_period.period_id,
    v_period.source_event_id,
    v_legacy.entry_id,
    v_now,
    v_now,
    p_actor_id,
    p_actor_id
  )
  returning * into v_item;

  insert into public.garage_direction_events (
    garage_item_id,
    from_direction,
    to_direction,
    reason,
    changed_at,
    changed_by
  ) values (
    v_item.garage_item_id,
    null,
    'UT',
    'Verifierat LEGACY_FLEET → Garage UT-handslag',
    v_now,
    p_actor_id
  );

  insert into public.garage_legacy_handoffs (
    legacy_entry_id,
    garage_item_id,
    journey_period_id,
    regnr,
    planned_station,
    model_description,
    model_source,
    handoff_type,
    occurred_at,
    actor_id,
    actor_email,
    historical_backfill
  ) values (
    v_legacy.entry_id,
    v_item.garage_item_id,
    v_period.period_id,
    v_regnr,
    v_station,
    v_model,
    v_model_source,
    'LEGACY_FLEET_TO_GARAGE_UT',
    v_now,
    p_actor_id,
    v_actor_email,
    false
  )
  returning * into v_handoff;

  return jsonb_build_object(
    'garageItem', to_jsonb(v_item),
    'handoff', to_jsonb(v_handoff),
    'legacyEntryId', v_legacy.entry_id,
    'journeyPeriodId', v_period.period_id,
    'avvecklaStarted', false,
    'historicalBackfill', false
  );
end;
$$;

revoke all on function public.materialize_legacy_fleet_to_garage_ut_v1(uuid,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.materialize_legacy_fleet_to_garage_ut_v1(uuid,text,text,uuid,text)
  to service_role;

-- Canonical LEGACY recipient is immutable with respect to generic Garage
-- voiding. There is no cancellation handoff in the current contract.
create or replace function public.guard_garage_item_void_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.voided_at is not null and new is distinct from old then
    raise exception 'Makulering av Garage-objekt är permanent';
  end if;

  if old.voided_at is null and new.voided_at is not null then
    if public.is_verified_salu_garage_recipient_v1(old.garage_item_id) then
      raise exception 'Verifierad SALU → Garage-mottagare kan inte makuleras genom generell Garage-makulering'
        using errcode = 'P0001';
    end if;

    if public.is_canonical_legacy_garage_recipient_v1(old.garage_item_id) then
      raise exception 'Verifierad LEGACY → Garage-mottagare kan inte makuleras genom generell Garage-makulering'
        using errcode = 'P0001';
    end if;

    if new.voided_by is null or nullif(btrim(new.void_reason), '') is null then
      raise exception 'Makulering kräver aktör och orsak';
    end if;
  elsif old.voided_at is null and new.voided_at is null then
    if new.voided_by is not null or new.void_reason is not null then
      raise exception 'Makulering måste sättas atomiskt';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.void_garage_item(
  p_garage_item_id uuid,
  p_reason text,
  p_actor uuid
)
returns public.garage_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.garage_items;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if p_actor is null then
    raise exception 'Aktör krävs';
  end if;
  if v_reason is null then
    raise exception 'Orsak krävs';
  end if;

  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage-objektet finns inte';
  end if;

  if v_item.voided_at is not null then
    return v_item;
  end if;

  if public.is_verified_salu_garage_recipient_v1(v_item.garage_item_id) then
    raise exception 'Verifierad SALU → Garage-mottagare kan inte makuleras genom generell Garage-makulering'
      using errcode = 'P0001';
  end if;

  if public.is_canonical_legacy_garage_recipient_v1(v_item.garage_item_id) then
    raise exception 'Verifierad LEGACY → Garage-mottagare kan inte makuleras genom generell Garage-makulering'
      using errcode = 'P0001';
  end if;

  if v_item.handed_off_nybil_id is not null
     or exists (
       select 1 from public.nybil_inventering n
       where n.source_garage_item_id = p_garage_item_id
     ) then
    raise exception 'Garage-objektet är redan överlämnat till Ny bil och kan inte makuleras';
  end if;

  if exists (
    select 1 from public.garage_wheel_changes w
    where w.garage_item_id = p_garage_item_id
  ) then
    raise exception 'Garage-objektet har hjulskifteshistorik och kan inte makuleras';
  end if;

  update public.garage_items
  set voided_at = clock_timestamp(),
      voided_by = p_actor,
      void_reason = v_reason,
      updated_at = clock_timestamp(),
      updated_by = p_actor
  where garage_item_id = p_garage_item_id
  returning * into v_item;

  return v_item;
end;
$$;

-- Preserve existing function exposure while keeping DB authority in the RPC.
revoke all on function public.void_garage_item(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.void_garage_item(uuid,text,uuid) to service_role;

comment on function public.materialize_legacy_fleet_to_garage_ut_v1(uuid,text,text,uuid,text) is
  'Idempotent current-only LEGACY -> Garage UT materialization. Exact retry returns the immutable existing source/recipient fact without mutation; conflicting reality rejects. Does not start AVVECKLA or fabricate terminal UT.';

commit;
