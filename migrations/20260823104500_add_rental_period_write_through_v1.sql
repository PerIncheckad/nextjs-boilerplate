begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- F / AvtalsNr is the stable source identity for one RENTAL period. The source
-- system is part of the identity so another upstream system cannot collide.
create unique index if not exists vehicle_journey_periods_rental_source_uidx
  on public.vehicle_journey_periods (source_system, source_record_id)
  where period_type = 'RENTAL'
    and source_entity = 'rental_operational_facts'
    and source_record_id is not null;

-- RENTAL is source-owned at the database boundary:
--   G / UtDt is the only permitted source start.
--   H / InDt is the only permitted source end.
-- Generic service-role callers therefore cannot manufacture or terminate a
-- RENTAL period through transition_vehicle_journey_state or direct UPDATE.
create or replace function public.guard_rental_period_source_ownership()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_expected_start_key text;
  v_expected_close_id text;
  v_new_source_key text;
begin
  if tg_op = 'INSERT' then
    if new.period_type <> 'RENTAL' then
      return new;
    end if;

    v_expected_start_key := pg_catalog.current_setting('incheckad.rental_start_source_key', true);
    v_new_source_key := coalesce(new.source_system, '') || ':' || coalesce(new.source_record_id, '');

    if new.source_entity <> 'rental_operational_facts'
      or nullif(v_expected_start_key, '') is null
      or v_expected_start_key <> v_new_source_key then
      raise exception 'RENTAL may only be started by G / UtDt from rental_operational_facts'
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  if old.period_type <> 'RENTAL' then
    return new;
  end if;

  -- A RENTAL period is historical evidence. Its identity/start/source cannot be
  -- rewritten after creation.
  if new.period_type is distinct from old.period_type
    or new.regnr is distinct from old.regnr
    or new.started_at is distinct from old.started_at
    or new.source_system is distinct from old.source_system
    or new.source_entity is distinct from old.source_entity
    or new.source_record_id is distinct from old.source_record_id
    or new.source_event_id is distinct from old.source_event_id then
    raise exception 'RENTAL period identity and G / UtDt are immutable'
      using errcode = 'P0001';
  end if;

  if new.ended_at is distinct from old.ended_at then
    v_expected_close_id := pg_catalog.current_setting('incheckad.rental_close_period_id', true);

    if old.ended_at is not null
      or new.ended_at is null
      or nullif(v_expected_close_id, '') is null
      or v_expected_close_id <> old.period_id::text then
      raise exception 'RENTAL may only be ended once by H / InDt from its rental source'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists vehicle_journey_rental_source_ownership_insert on public.vehicle_journey_periods;
create trigger vehicle_journey_rental_source_ownership_insert
before insert on public.vehicle_journey_periods
for each row
when (new.period_type = 'RENTAL')
execute function public.guard_rental_period_source_ownership();

drop trigger if exists vehicle_journey_rental_source_ownership_update on public.vehicle_journey_periods;
create trigger vehicle_journey_rental_source_ownership_update
before update on public.vehicle_journey_periods
for each row
when (old.period_type = 'RENTAL')
execute function public.guard_rental_period_source_ownership();

create or replace function public.close_rental_period_from_source(
  p_period_id uuid,
  p_regnr text,
  p_ended_at timestamptz,
  p_source_system text,
  p_source_record_id text,
  p_rental_fact_id uuid,
  p_source_raw_row_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_period public.vehicle_journey_periods%rowtype;
  v_duration_hours numeric;
begin
  select *
  into v_period
  from public.vehicle_journey_periods
  where period_id = p_period_id
    and regnr = p_regnr
    and period_type = 'RENTAL'
    and source_system = p_source_system
    and source_entity = 'rental_operational_facts'
    and source_record_id = p_source_record_id
  for update;

  if not found then
    raise exception 'Source-owned RENTAL period not found' using errcode = 'P0002';
  end if;
  if v_period.ended_at is not null then
    if v_period.ended_at = p_ended_at then
      return pg_catalog.jsonb_build_object(
        'period_id', v_period.period_id,
        'started_at', v_period.started_at,
        'ended_at', v_period.ended_at,
        'idempotent', true
      );
    end if;
    raise exception 'Closed RENTAL H / InDt cannot be rewritten silently' using errcode = 'P0001';
  end if;
  if p_ended_at is null or p_ended_at < v_period.started_at then
    raise exception 'H / InDt cannot be before G / UtDt' using errcode = '22007';
  end if;

  perform pg_catalog.set_config('incheckad.rental_close_period_id', v_period.period_id::text, true);

  update public.vehicle_journey_periods
  set ended_at = p_ended_at,
      updated_at = pg_catalog.now()
  where period_id = v_period.period_id
  returning * into v_period;

  v_duration_hours := pg_catalog.round(
    (extract(epoch from (p_ended_at - v_period.started_at)) / 3600.0)::numeric,
    1
  );

  insert into public.vehicle_journey_events (
    regnr,
    event_type,
    event_key,
    occurred_at,
    source_system,
    source_entity,
    source_record_id,
    actor_id,
    actor_source,
    actor_email,
    payload
  ) values (
    v_period.regnr,
    'PERIOD_ENDED',
    'rental-source:' || p_source_system || ':' || p_source_record_id || ':PERIOD_ENDED',
    p_ended_at,
    p_source_system,
    'rental_operational_facts',
    p_source_record_id,
    null,
    'EXTERNAL',
    null,
    pg_catalog.jsonb_build_object(
      'periodType', 'RENTAL',
      'startedAt', v_period.started_at,
      'endedAt', p_ended_at,
      'durationHours', v_duration_hours,
      'sourceKind', 'RENTAL_AGREEMENT',
      'sourceField', 'H/InDt',
      'rentalFactId', p_rental_fact_id,
      'sourceRawRowId', p_source_raw_row_id
    )
  )
  on conflict (event_key) do nothing;

  perform pg_catalog.set_config('incheckad.rental_close_period_id', '', true);

  return pg_catalog.jsonb_build_object(
    'period_id', v_period.period_id,
    'started_at', v_period.started_at,
    'ended_at', v_period.ended_at,
    'durationHours', v_duration_hours,
    'idempotent', false
  );
end;
$$;

create or replace function public.insert_closed_rental_period_from_source(
  p_period_id uuid,
  p_regnr text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_source_system text,
  p_source_record_id text,
  p_rental_fact_id uuid,
  p_source_raw_row_id uuid,
  p_station_no text,
  p_out_station text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_start_event_id uuid;
  v_duration_hours numeric;
begin
  if p_started_at is null or p_ended_at is null or p_ended_at < p_started_at then
    raise exception 'Historical RENTAL requires valid G / UtDt and H / InDt' using errcode = '22007';
  end if;

  if exists (
    select 1
    from public.vehicle_journey_periods
    where regnr = p_regnr
      and started_at < p_ended_at
      and (ended_at is null or ended_at > p_started_at)
  ) then
    raise exception 'Historical RENTAL overlaps existing verified vehicle journey time'
      using errcode = 'P0001';
  end if;

  insert into public.vehicle_journey_events (
    regnr,
    event_type,
    event_key,
    occurred_at,
    source_system,
    source_entity,
    source_record_id,
    actor_id,
    actor_source,
    actor_email,
    payload
  ) values (
    p_regnr,
    'PERIOD_STARTED',
    'rental-source:' || p_source_system || ':' || p_source_record_id || ':PERIOD_STARTED',
    p_started_at,
    p_source_system,
    'rental_operational_facts',
    p_source_record_id,
    null,
    'EXTERNAL',
    null,
    pg_catalog.jsonb_build_object(
      'periodType', 'RENTAL',
      'startedAt', p_started_at,
      'sourceKind', 'RENTAL_AGREEMENT',
      'sourceField', 'G/UtDt',
      'rentalFactId', p_rental_fact_id,
      'sourceRawRowId', p_source_raw_row_id,
      'stationNo', p_station_no,
      'outStation', p_out_station,
      'historicalClosedRental', true
    )
  )
  returning event_id into v_start_event_id;

  perform pg_catalog.set_config(
    'incheckad.rental_start_source_key',
    p_source_system || ':' || p_source_record_id,
    true
  );

  insert into public.vehicle_journey_periods (
    period_id,
    regnr,
    period_type,
    started_at,
    ended_at,
    reason_code,
    reason_text,
    source_system,
    source_entity,
    source_record_id,
    source_event_id,
    metadata,
    created_by
  ) values (
    p_period_id,
    p_regnr,
    'RENTAL',
    p_started_at,
    p_ended_at,
    null,
    null,
    p_source_system,
    'rental_operational_facts',
    p_source_record_id,
    v_start_event_id,
    pg_catalog.jsonb_build_object(
      'sourceKind', 'RENTAL_AGREEMENT',
      'rentalFactId', p_rental_fact_id,
      'sourceRawRowId', p_source_raw_row_id,
      'stationNo', p_station_no,
      'outStation', p_out_station,
      'historicalClosedRental', true
    ),
    null
  );

  perform pg_catalog.set_config('incheckad.rental_start_source_key', '', true);

  v_duration_hours := pg_catalog.round(
    (extract(epoch from (p_ended_at - p_started_at)) / 3600.0)::numeric,
    1
  );

  insert into public.vehicle_journey_events (
    regnr,
    event_type,
    event_key,
    occurred_at,
    source_system,
    source_entity,
    source_record_id,
    actor_id,
    actor_source,
    actor_email,
    payload
  ) values (
    p_regnr,
    'PERIOD_ENDED',
    'rental-source:' || p_source_system || ':' || p_source_record_id || ':PERIOD_ENDED',
    p_ended_at,
    p_source_system,
    'rental_operational_facts',
    p_source_record_id,
    null,
    'EXTERNAL',
    null,
    pg_catalog.jsonb_build_object(
      'periodType', 'RENTAL',
      'startedAt', p_started_at,
      'endedAt', p_ended_at,
      'durationHours', v_duration_hours,
      'sourceKind', 'RENTAL_AGREEMENT',
      'sourceField', 'H/InDt',
      'rentalFactId', p_rental_fact_id,
      'sourceRawRowId', p_source_raw_row_id,
      'historicalClosedRental', true
    )
  );

  return pg_catalog.jsonb_build_object(
    'period_id', p_period_id,
    'started_at', p_started_at,
    'ended_at', p_ended_at,
    'durationHours', v_duration_hours,
    'historicalClosedRental', true
  );
end;
$$;

create or replace function public.try_write_through_rental_period(
  p_rental_fact_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_fact public.rental_operational_facts%rowtype;
  v_existing public.vehicle_journey_periods%rowtype;
  v_current public.vehicle_journey_periods%rowtype;
  v_failure_record_id text;
  v_error_code text;
  v_error_message text;
begin
  select *
  into v_fact
  from public.rental_operational_facts
  where rental_fact_id = p_rental_fact_id;

  if not found then
    raise exception 'Rental operational fact not found' using errcode = 'P0002';
  end if;

  v_failure_record_id := v_fact.source_system || ':' || v_fact.source_record_id;

  begin
    select *
    into v_existing
    from public.vehicle_journey_periods
    where period_type = 'RENTAL'
      and source_system = v_fact.source_system
      and source_entity = 'rental_operational_facts'
      and source_record_id = v_fact.source_record_id
    for update;

    if found then
      if v_existing.regnr <> v_fact.regnr then
        raise exception 'Existing RENTAL vehicle identity conflicts with I / RegNr' using errcode = 'P0001';
      end if;
      if v_existing.started_at <> v_fact.out_at then
        raise exception 'Existing RENTAL G / UtDt cannot be rewritten silently' using errcode = 'P0001';
      end if;

      if v_existing.ended_at is null then
        if v_fact.in_at is not null then
          perform public.close_rental_period_from_source(
            v_existing.period_id,
            v_fact.regnr,
            v_fact.in_at,
            v_fact.source_system,
            v_fact.source_record_id,
            v_fact.rental_fact_id,
            v_fact.source_raw_row_id
          );
        end if;
      else
        if v_fact.in_at is null then
          raise exception 'Closed RENTAL cannot be reopened by removing H / InDt' using errcode = 'P0001';
        end if;
        if v_existing.ended_at <> v_fact.in_at then
          raise exception 'Closed RENTAL H / InDt cannot be rewritten silently' using errcode = 'P0001';
        end if;
      end if;

      update public.period_write_through_failures
      set resolved_at = coalesce(resolved_at, pg_catalog.now())
      where source_entity = 'rental_operational_facts'
        and source_record_id = v_failure_record_id
        and resolved_at is null;

      return true;
    end if;

    -- A row that already has H on first sight is historical evidence. Insert it
    -- as a closed period without transitioning or changing the current state.
    if v_fact.in_at is not null then
      perform public.insert_closed_rental_period_from_source(
        gen_random_uuid(),
        v_fact.regnr,
        v_fact.out_at,
        v_fact.in_at,
        v_fact.source_system,
        v_fact.source_record_id,
        v_fact.rental_fact_id,
        v_fact.source_raw_row_id,
        v_fact.station_no,
        v_fact.out_station
      );

      update public.period_write_through_failures
      set resolved_at = coalesce(resolved_at, pg_catalog.now())
      where source_entity = 'rental_operational_facts'
        and source_record_id = v_failure_record_id
        and resolved_at is null;

      return true;
    end if;

    -- Active RENTAL is an interval [G, infinity). If there is no current state,
    -- any journey period extending beyond G would conflict with that interval.
    select *
    into v_current
    from public.vehicle_journey_periods
    where regnr = v_fact.regnr
      and ended_at is null
    for update;

    if found then
      if v_current.period_type = 'RENTAL' then
        raise exception 'Vehicle already has another open RENTAL source record' using errcode = 'P0001';
      end if;
      if v_current.started_at > v_fact.out_at then
        raise exception 'Active RENTAL G / UtDt predates the current verified state' using errcode = 'P0001';
      end if;

      if exists (
        select 1
        from public.vehicle_journey_periods p
        where p.regnr = v_fact.regnr
          and p.period_id <> v_current.period_id
          and (p.ended_at is null or p.ended_at > v_fact.out_at)
      ) then
        raise exception 'Active RENTAL overlaps existing verified vehicle journey history' using errcode = 'P0001';
      end if;
    else
      if exists (
        select 1
        from public.vehicle_journey_periods p
        where p.regnr = v_fact.regnr
          and (p.ended_at is null or p.ended_at > v_fact.out_at)
      ) then
        raise exception 'Active RENTAL overlaps existing verified vehicle journey history' using errcode = 'P0001';
      end if;
    end if;

    perform pg_catalog.set_config(
      'incheckad.rental_start_source_key',
      v_fact.source_system || ':' || v_fact.source_record_id,
      true
    );

    perform public.transition_vehicle_journey_state(
      gen_random_uuid(),
      v_fact.regnr,
      'RENTAL',
      v_fact.out_at,
      null,
      null,
      v_fact.source_system,
      'rental_operational_facts',
      v_fact.source_record_id,
      null,
      'EXTERNAL',
      null,
      pg_catalog.jsonb_build_object(
        'sourceKind', 'RENTAL_AGREEMENT',
        'sourceField', 'G/UtDt',
        'rentalFactId', v_fact.rental_fact_id,
        'sourceRawRowId', v_fact.source_raw_row_id,
        'stationNo', v_fact.station_no,
        'outStation', v_fact.out_station
      )
    );

    perform pg_catalog.set_config('incheckad.rental_start_source_key', '', true);

    update public.period_write_through_failures
    set resolved_at = coalesce(resolved_at, pg_catalog.now())
    where source_entity = 'rental_operational_facts'
      and source_record_id = v_failure_record_id
      and resolved_at is null;

    return true;
  exception when others then
    v_error_code := SQLSTATE;
    v_error_message := SQLERRM;

    begin
      insert into public.period_write_through_failures as failure (
        regnr,
        source_entity,
        source_record_id,
        target_state,
        error_code,
        error_message
      ) values (
        coalesce(nullif(v_fact.regnr, ''), 'UNKNOWN'),
        'rental_operational_facts',
        v_failure_record_id,
        case when v_fact.in_at is null then 'RENTAL' else 'RENTAL_ENDED' end,
        v_error_code,
        pg_catalog.left(v_error_message, 2000)
      )
      on conflict (source_entity, source_record_id)
      do update set
        target_state = excluded.target_state,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        attempts = failure.attempts + 1,
        last_failed_at = pg_catalog.now(),
        resolved_at = null;
    exception when others then
      raise warning '[rental-period-write-through] Could not persist failure for %.%: %',
        v_fact.source_system, v_fact.source_record_id, SQLERRM;
    end;

    raise warning '[rental-period-write-through] %.% failed [%]: %',
      v_fact.source_system, v_fact.source_record_id, v_error_code, v_error_message;

    return false;
  end;
end;
$$;

create or replace function public.write_through_rental_period()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- E / Avsl. Datum, A-D and other non-G/H/I changes are not vehicle-state
  -- signals. The canonical source fact may change without touching the journey.
  if tg_op = 'UPDATE'
    and old.source_system is not distinct from new.source_system
    and old.source_record_id is not distinct from new.source_record_id
    and old.regnr is not distinct from new.regnr
    and old.out_at is not distinct from new.out_at
    and old.in_at is not distinct from new.in_at then
    return new;
  end if;

  perform public.try_write_through_rental_period(new.rental_fact_id);
  return new;
exception when others then
  raise warning '[rental-period-write-through] Trigger adapter failed: %', SQLERRM;
  return new;
end;
$$;

drop trigger if exists rental_operational_fact_period_write_through on public.rental_operational_facts;
create trigger rental_operational_fact_period_write_through
after insert or update on public.rental_operational_facts
for each row
execute function public.write_through_rental_period();

create or replace function public.replay_rental_period_write_through(
  p_rental_fact_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return public.try_write_through_rental_period(p_rental_fact_id);
end;
$$;

revoke all on function public.guard_rental_period_source_ownership()
  from public, anon, authenticated;
revoke all on function public.close_rental_period_from_source(uuid, text, timestamptz, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.insert_closed_rental_period_from_source(uuid, text, timestamptz, timestamptz, text, text, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.try_write_through_rental_period(uuid)
  from public, anon, authenticated;
revoke all on function public.write_through_rental_period()
  from public, anon, authenticated;
revoke all on function public.replay_rental_period_write_through(uuid)
  from public, anon, authenticated;

grant execute on function public.guard_rental_period_source_ownership()
  to service_role;
grant execute on function public.close_rental_period_from_source(uuid, text, timestamptz, text, text, uuid, uuid)
  to service_role;
grant execute on function public.insert_closed_rental_period_from_source(uuid, text, timestamptz, timestamptz, text, text, uuid, uuid, text, text)
  to service_role;
grant execute on function public.try_write_through_rental_period(uuid)
  to service_role;
grant execute on function public.write_through_rental_period()
  to service_role;
grant execute on function public.replay_rental_period_write_through(uuid)
  to service_role;

commit;
