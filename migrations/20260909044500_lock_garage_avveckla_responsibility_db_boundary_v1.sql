begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Garage -> AVVECKLA is a historical responsibility handoff. Exact retries
-- return the already established fact before current Garage state is judged.
create or replace function public.start_garage_avveckla_case(
  p_garage_item_id uuid,
  p_reason text,
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
  v_event public.garage_avveckla_events%rowtype;
  v_event_id uuid;
  v_started_count integer;
  v_period_count integer;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_actor_email text := nullif(trim(coalesce(p_actor_email, '')), '');
  v_regnr text;
begin
  if p_actor is null then
    raise exception 'Aktör krävs' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Orsak krävs' using errcode = '22023';
  end if;

  -- Serialize every start/retry on the exact Garage source before looking at
  -- either the historical handoff or mutable current state.
  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage-objektet finns inte' using errcode = 'P0002';
  end if;

  -- Historical fact first. Once responsibility moved, later Garage state is
  -- not allowed to make that already established handoff false.
  select * into v_case
  from public.garage_avveckla_cases
  where garage_item_id = p_garage_item_id
  for update;

  if found then
    select count(*) into v_started_count
    from public.garage_avveckla_events
    where avveckla_case_id = v_case.avveckla_case_id
      and event_type = 'AVVECKLA_STARTED';

    select * into v_event
    from public.garage_avveckla_events
    where event_key = 'garage-avveckla:' || v_case.avveckla_case_id::text || ':STARTED';

    if v_started_count <> 1
       or not found
       or v_case.garage_item_id is distinct from p_garage_item_id
       or v_case.reason is distinct from v_reason
       or v_case.started_by is distinct from p_actor
       or v_case.started_by_email is distinct from v_actor_email
       or v_event.avveckla_case_id is distinct from v_case.avveckla_case_id
       or v_event.garage_item_id is distinct from v_case.garage_item_id
       or v_event.regnr is distinct from v_case.regnr
       or v_event.event_type is distinct from 'AVVECKLA_STARTED'
       or v_event.actor_id is distinct from v_case.started_by
       or v_event.actor_email is distinct from v_case.started_by_email
       or v_event.payload ->> 'reason' is distinct from v_case.reason then
      raise exception 'AVVECKLA start-retry konflikterar med etablerat historiskt handslag'
        using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'case', to_jsonb(v_case),
      'event_id', v_event.event_id
    );
  end if;

  if v_item.voided_at is not null then
    raise exception 'Makulerat Garage-objekt kan inte starta AVVECKLA' using errcode = 'P0001';
  end if;
  if v_item.handed_off_nybil_id is not null then
    raise exception 'Garage-objektet är redan överlämnat till Ny bil' using errcode = 'P0001';
  end if;
  if v_item.completed_at is not null then
    raise exception 'Garage-objektet är redan avslutat' using errcode = 'P0001';
  end if;
  if v_item.garage_direction <> 'UT' then
    raise exception 'AVVECKLA kan bara startas för Garage-riktning UT' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(v_item.regnr, '')), '') is null then
    raise exception 'AVVECKLA kräver registreringsnummer' using errcode = 'P0001';
  end if;

  v_regnr := upper(regexp_replace(v_item.regnr, '\s+', '', 'g'));

  -- Upstream terminability is a precondition for accepting responsibility.
  -- Lock every currently open Layer-1 period while counting so the handoff
  -- cannot race a concurrent close.
  select count(*) into v_period_count
  from (
    select p.period_id
    from public.vehicle_journey_periods p
    where upper(regexp_replace(p.regnr, '\s+', '', 'g')) = v_regnr
      and p.ended_at is null
    for update
  ) locked_periods;

  if v_period_count = 0 then
    raise exception 'AVVECKLA kan inte starta: exakt en öppen Layer 1-period krävs men ingen finns'
      using errcode = 'P0001';
  end if;
  if v_period_count > 1 then
    raise exception 'AVVECKLA kan inte starta: exakt en öppen Layer 1-period krävs men flera finns'
      using errcode = 'P0001';
  end if;

  insert into public.garage_avveckla_cases (
    garage_item_id,
    regnr,
    reason,
    started_by,
    started_by_email
  ) values (
    p_garage_item_id,
    v_regnr,
    v_reason,
    p_actor,
    v_actor_email
  )
  returning * into v_case;

  insert into public.garage_avveckla_events (
    avveckla_case_id,
    garage_item_id,
    regnr,
    event_type,
    event_key,
    actor_id,
    actor_email,
    actor_source,
    payload
  ) values (
    v_case.avveckla_case_id,
    p_garage_item_id,
    v_case.regnr,
    'AVVECKLA_STARTED',
    'garage-avveckla:' || v_case.avveckla_case_id::text || ':STARTED',
    p_actor,
    v_actor_email,
    'MANUELL',
    jsonb_build_object('reason', v_reason)
  ) returning event_id into v_event_id;

  return jsonb_build_object(
    'case', to_jsonb(v_case),
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.start_garage_avveckla_case(uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.start_garage_avveckla_case(uuid,text,uuid,text)
  to service_role;

-- Once a canonical AVVECKLA case exists, Garage has handed responsibility to
-- AVVECKLA. Ordinary Garage writes are frozen. The only allowed Garage update
-- is the exact terminal write made after the canonical AVVECKLA terminal event
-- and case completion already exist in the same transaction.
create or replace function public.guard_garage_after_avveckla_start_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_case public.garage_avveckla_cases%rowtype;
  v_event public.garage_avveckla_events%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.completed_at is not null
       or new.completed_by is not null
       or new.completion_event_id is not null then
      raise exception 'Terminal Garage-historik kan endast skapas av canonical AVVECKLA completion'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new is not distinct from old then
    return new;
  end if;

  select * into v_case
  from public.garage_avveckla_cases
  where garage_item_id = old.garage_item_id;

  if not found then
    if old.completed_at is null and new.completed_at is not null then
      raise exception 'Terminal Garage-historik kräver canonical AVVECKLA-case och completion-event'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  if old.completed_at is null and new.completed_at is not null then
    select * into v_event
    from public.garage_avveckla_events
    where event_id = new.completion_event_id;

    if v_case.status = 'COMPLETED'
       and v_case.completed_at is not distinct from new.completed_at
       and v_case.completed_by is not distinct from new.completed_by
       and v_case.completion_event_id is not distinct from new.completion_event_id
       and found
       and v_event.avveckla_case_id is not distinct from v_case.avveckla_case_id
       and v_event.garage_item_id is not distinct from old.garage_item_id
       and v_event.event_type in (
         'UT_OVERLAMNING_VERIFIERAD',
         'UT_TRANSPORTOR_HAMTAT_VERIFIERAD',
         'UT_AVSTALLNING_VERIFIERAD'
       )
       and v_event.occurred_at is not distinct from new.completed_at
       and v_event.actor_id is not distinct from new.completed_by
       and new.updated_by is not distinct from new.completed_by
       and (
         to_jsonb(new) - array['completed_at','completed_by','completion_event_id','updated_at','updated_by']::text[]
       ) is not distinct from (
         to_jsonb(old) - array['completed_at','completed_by','completion_event_id','updated_at','updated_by']::text[]
       ) then
      return new;
    end if;

    raise exception 'Terminal Garage-historik kan endast skapas av canonical AVVECKLA completion'
      using errcode = 'P0001';
  end if;

  raise exception 'Garage-objekt med etablerat AVVECKLA-case är överlämnat och fryst för generell Garage-runtime'
    using errcode = 'P0001';
end;
$$;

revoke all on function public.guard_garage_after_avveckla_start_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists garage_items_avveckla_responsibility_freeze_v1 on public.garage_items;
create trigger garage_items_avveckla_responsibility_freeze_v1
before insert or update on public.garage_items
for each row execute function public.guard_garage_after_avveckla_start_v1();

-- While AVVECKLA owns an OPEN case, the relevant Layer-1 period may only be
-- closed after the exact canonical terminal AVVECKLA event has been written.
-- This blocks direct service-role DML without changing other Layer-1 flows.
create or replace function public.guard_layer1_close_after_avveckla_start_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_regnr text;
begin
  if tg_op = 'INSERT' then
    if new.ended_at is null then
      return new;
    end if;
    v_regnr := upper(regexp_replace(new.regnr, '\s+', '', 'g'));
  else
    if old.ended_at is not null or new.ended_at is null then
      return new;
    end if;
    v_regnr := upper(regexp_replace(old.regnr, '\s+', '', 'g'));
  end if;

  if exists (
    select 1
    from public.garage_avveckla_cases c
    join public.garage_items g on g.garage_item_id = c.garage_item_id
    where c.status = 'OPEN'
      and upper(regexp_replace(c.regnr, '\s+', '', 'g')) = v_regnr
      and upper(regexp_replace(coalesce(g.regnr, ''), '\s+', '', 'g')) = v_regnr
  ) then
    if tg_op = 'INSERT' then
      raise exception 'Layer 1 kan inte fabricera terminal historik medan AVVECKLA äger bilen'
        using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.garage_avveckla_events e
      join public.garage_avveckla_cases c on c.avveckla_case_id = e.avveckla_case_id
      where c.status = 'OPEN'
        and c.garage_item_id = e.garage_item_id
        and upper(regexp_replace(c.regnr, '\s+', '', 'g')) = v_regnr
        and e.event_type in (
          'UT_OVERLAMNING_VERIFIERAD',
          'UT_TRANSPORTOR_HAMTAT_VERIFIERAD',
          'UT_AVSTALLNING_VERIFIERAD'
        )
        and e.occurred_at is not distinct from new.ended_at
        and e.payload ->> 'journeyPeriodId' = old.period_id::text
    ) then
      raise exception 'Layer 1-period under AVVECKLA-ansvar kan endast stängas av canonical terminal completion'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_layer1_close_after_avveckla_start_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists vehicle_journey_periods_avveckla_close_guard_v1 on public.vehicle_journey_periods;
create trigger vehicle_journey_periods_avveckla_close_guard_v1
before insert or update of ended_at on public.vehicle_journey_periods
for each row execute function public.guard_layer1_close_after_avveckla_start_v1();

-- Runtime reads AVVECKLA state; all writes must pass the postgres-owned
-- SECURITY DEFINER contract functions above and in the existing foundation.
revoke all privileges on table public.garage_avveckla_cases
  from public, anon, authenticated, service_role;
revoke all privileges on table public.garage_avveckla_points
  from public, anon, authenticated, service_role;
revoke all privileges on table public.garage_avveckla_events
  from public, anon, authenticated, service_role;

grant select on table public.garage_avveckla_cases to service_role;
grant select on table public.garage_avveckla_points to service_role;
grant select on table public.garage_avveckla_events to service_role;

comment on function public.start_garage_avveckla_case(uuid,text,uuid,text) is
  'Canonical Garage -> AVVECKLA responsibility handoff. Requires exactly one open Layer-1 period for a new handoff; exact retry returns the immutable existing case + STARTED event before current-state validation.';
comment on function public.guard_garage_after_avveckla_start_v1() is
  'DB authority boundary: after canonical AVVECKLA start, generic Garage mutation/void is frozen; only coherent canonical terminal completion may set Garage completion fields.';
comment on function public.guard_layer1_close_after_avveckla_start_v1() is
  'DB authority boundary: an open AVVECKLA-owned vehicle period can only be closed after the exact canonical terminal AVVECKLA event exists.';

commit;
