begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Prevent concurrent requests from opening duplicate periods of the same type.
create unique index if not exists vehicle_journey_periods_one_open_type_uidx
  on public.vehicle_journey_periods (regnr, period_type)
  where ended_at is null;

create or replace function public.start_vehicle_journey_period(
  p_period_id uuid,
  p_regnr text,
  p_period_type text,
  p_started_at timestamptz,
  p_reason_code text,
  p_reason_text text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event_id uuid;
  v_period public.vehicle_journey_periods%rowtype;
begin
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
    'vehicle-period:' || p_period_id::text || ':PERIOD_STARTED',
    p_started_at,
    'VAGNKORT',
    'vehicle_journey_periods',
    p_period_id::text,
    p_actor_id,
    'MANUELL',
    p_actor_email,
    pg_catalog.jsonb_build_object(
      'periodType', p_period_type,
      'startedAt', p_started_at,
      'reasonCode', p_reason_code,
      'reasonText', p_reason_text
    )
  )
  returning event_id into v_event_id;

  insert into public.vehicle_journey_periods (
    period_id,
    regnr,
    period_type,
    started_at,
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
    p_period_type,
    p_started_at,
    p_reason_code,
    p_reason_text,
    'VAGNKORT',
    'vehicle_journey_periods',
    p_period_id::text,
    v_event_id,
    '{"createdVia":"VAGNKORT"}'::jsonb,
    p_actor_id
  )
  returning * into v_period;

  return pg_catalog.jsonb_build_object(
    'period_id', v_period.period_id,
    'period_type', v_period.period_type,
    'started_at', v_period.started_at,
    'ended_at', v_period.ended_at,
    'reason_code', v_period.reason_code,
    'reason_text', v_period.reason_text,
    'source_system', v_period.source_system,
    'source_event_id', v_period.source_event_id,
    'metadata', v_period.metadata,
    'created_at', v_period.created_at,
    'updated_at', v_period.updated_at
  );
end;
$$;

create or replace function public.close_vehicle_journey_period(
  p_period_id uuid,
  p_regnr text,
  p_ended_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
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
  for update;

  if not found then
    raise exception 'Period not found for vehicle' using errcode = 'P0002';
  end if;

  if v_period.ended_at is not null then
    raise exception 'Period is already closed' using errcode = 'P0001';
  end if;

  if p_ended_at < v_period.started_at then
    raise exception 'End time cannot be before start time' using errcode = '22007';
  end if;

  update public.vehicle_journey_periods
  set ended_at = p_ended_at,
      updated_at = pg_catalog.now()
  where period_id = p_period_id
  returning * into v_period;

  v_duration_hours := pg_catalog.round(
    (pg_catalog.extract(epoch from (p_ended_at - v_period.started_at)) / 3600.0)::numeric,
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
    'vehicle-period:' || p_period_id::text || ':PERIOD_ENDED',
    p_ended_at,
    'VAGNKORT',
    'vehicle_journey_periods',
    p_period_id::text,
    p_actor_id,
    'MANUELL',
    p_actor_email,
    pg_catalog.jsonb_build_object(
      'periodType', v_period.period_type,
      'startedAt', v_period.started_at,
      'endedAt', p_ended_at,
      'durationHours', v_duration_hours,
      'reasonCode', v_period.reason_code,
      'reasonText', v_period.reason_text
    )
  );

  return pg_catalog.jsonb_build_object(
    'period_id', v_period.period_id,
    'period_type', v_period.period_type,
    'started_at', v_period.started_at,
    'ended_at', v_period.ended_at,
    'reason_code', v_period.reason_code,
    'reason_text', v_period.reason_text,
    'source_system', v_period.source_system,
    'source_event_id', v_period.source_event_id,
    'metadata', v_period.metadata,
    'created_at', v_period.created_at,
    'updated_at', v_period.updated_at,
    'durationHours', v_duration_hours
  );
end;
$$;

revoke all on function public.start_vehicle_journey_period(uuid, text, text, timestamptz, text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.close_vehicle_journey_period(uuid, text, timestamptz, uuid, text)
  from public, anon, authenticated;

grant execute on function public.start_vehicle_journey_period(uuid, text, text, timestamptz, text, text, uuid, text)
  to service_role;
grant execute on function public.close_vehicle_journey_period(uuid, text, timestamptz, uuid, text)
  to service_role;

commit;
