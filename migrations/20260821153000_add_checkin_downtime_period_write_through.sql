begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A completed Check-in may establish DOWNTIME only when the operator explicitly
-- states that the vehicle cannot be rented and provides a reason. A normal
-- Check-in does not imply AVAILABLE and never invents RENTAL.
create unique index if not exists vehicle_journey_periods_checkin_unavailable_source_uidx
  on public.vehicle_journey_periods (source_record_id)
  where source_system = 'CHECKIN'
    and source_entity = 'checkins'
    and source_record_id is not null;

create or replace function public.try_write_through_checkin_downtime_period(
  p_checkin_id uuid,
  p_regnr text,
  p_status text,
  p_completed_at timestamptz,
  p_checklist jsonb,
  p_completed_by uuid,
  p_checker_email text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text;
  v_source_record_id text;
  v_unavailable boolean;
  v_reason_text text;
  v_current public.vehicle_journey_periods%rowtype;
  v_error_code text;
  v_error_message text;
begin
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  v_source_record_id := p_checkin_id::text;

  if v_regnr = '' or p_checkin_id is null then
    return false;
  end if;

  if p_status <> 'COMPLETED' or p_completed_at is null then
    return true;
  end if;

  v_unavailable := coalesce((p_checklist ->> 'rental_unavailable')::boolean, false);
  if not v_unavailable then
    return true;
  end if;

  v_reason_text := nullif(trim(coalesce(p_checklist ->> 'rental_unavailable_comment', '')), '');

  begin
    if exists (
      select 1
      from public.vehicle_journey_periods
      where source_system = 'CHECKIN'
        and source_entity = 'checkins'
        and source_record_id = v_source_record_id
    ) then
      update public.period_write_through_failures
      set resolved_at = coalesce(resolved_at, pg_catalog.now())
      where source_entity = 'checkins'
        and source_record_id = v_source_record_id
        and resolved_at is null;
      return true;
    end if;

    if v_reason_text is null then
      raise exception 'Check-in rental_unavailable requires an explicit comment before DOWNTIME can be established'
        using errcode = '22023';
    end if;

    select *
    into v_current
    from public.vehicle_journey_periods
    where regnr = v_regnr
      and ended_at is null
    for update;

    -- If the vehicle is already in DOWNTIME, this Check-in confirms the current
    -- inability to rent but must not split or restart the ongoing downtime.
    if found and v_current.period_type = 'DOWNTIME' then
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
        v_regnr,
        'DOWNTIME_CONFIRMED',
        'checkin:' || v_source_record_id || ':DOWNTIME_CONFIRMED',
        p_completed_at,
        'CHECKIN',
        'checkins',
        v_source_record_id,
        p_completed_by,
        'MANUELL',
        nullif(trim(coalesce(p_checker_email, '')), ''),
        pg_catalog.jsonb_build_object(
          'sourceKind', 'CHECKIN_RENTAL_UNAVAILABLE',
          'reasonText', v_reason_text,
          'existingPeriodId', v_current.period_id
        )
      )
      on conflict (event_key) do nothing;

      return true;
    end if;

    perform public.transition_vehicle_journey_state(
      gen_random_uuid(),
      v_regnr,
      'DOWNTIME',
      p_completed_at,
      'OTHER',
      v_reason_text,
      'CHECKIN',
      'checkins',
      v_source_record_id,
      p_completed_by,
      'MANUELL',
      nullif(trim(coalesce(p_checker_email, '')), ''),
      pg_catalog.jsonb_build_object(
        'sourceKind', 'CHECKIN_RENTAL_UNAVAILABLE',
        'sourceField', 'checklist.rental_unavailable',
        'unavailable', true
      )
    );

    update public.period_write_through_failures
    set resolved_at = coalesce(resolved_at, pg_catalog.now())
    where source_entity = 'checkins'
      and source_record_id = v_source_record_id
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
        coalesce(nullif(v_regnr, ''), 'UNKNOWN'),
        'checkins',
        coalesce(nullif(v_source_record_id, ''), 'UNKNOWN'),
        'DOWNTIME',
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
      raise warning '[period-write-through] Could not persist Check-in failure %.%: %',
        'checkins', v_source_record_id, SQLERRM;
    end;

    raise warning '[period-write-through] Check-in %.% failed [%]: %',
      'checkins', v_source_record_id, v_error_code, v_error_message;

    return false;
  end;
end;
$$;

create or replace function public.write_through_checkin_downtime_period()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.try_write_through_checkin_downtime_period(
    new.id,
    new.regnr,
    new.status,
    new.completed_at,
    new.checklist,
    new.completed_by,
    new.checker_email
  );

  return new;
exception when others then
  raise warning '[period-write-through] Check-in statement adapter failed: %', SQLERRM;
  return new;
end;
$$;

drop trigger if exists checkin_downtime_period_write_through on public.checkins;
create trigger checkin_downtime_period_write_through
after insert or update of status, completed_at, checklist on public.checkins
for each row
when (new.status = 'COMPLETED' and new.completed_at is not null)
execute function public.write_through_checkin_downtime_period();

revoke all on function public.try_write_through_checkin_downtime_period(uuid, text, text, timestamptz, jsonb, uuid, text)
  from public, anon, authenticated;
revoke all on function public.write_through_checkin_downtime_period()
  from public, anon, authenticated;

grant execute on function public.try_write_through_checkin_downtime_period(uuid, text, text, timestamptz, jsonb, uuid, text)
  to service_role;
grant execute on function public.write_through_checkin_downtime_period()
  to service_role;

commit;
