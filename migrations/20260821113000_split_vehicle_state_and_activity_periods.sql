begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The vehicle journey has one primary operational state at a time. Workshop,
-- transport, waiting for parts etc. are activities/causes inside downtime and
-- must not be counted as competing vehicle states.
do $$
begin
  if exists (
    select 1
    from public.vehicle_journey_periods
    where period_type in ('WORKSHOP', 'TRANSPORT')
  ) then
    raise exception 'Cannot split journey time model while WORKSHOP/TRANSPORT primary periods exist';
  end if;
end;
$$;

alter table public.vehicle_journey_periods
  drop constraint if exists vehicle_journey_periods_period_type_check;

alter table public.vehicle_journey_periods
  add constraint vehicle_journey_periods_period_type_check
  check (period_type in ('PREPARATION', 'AVAILABLE', 'RENTAL', 'DOWNTIME', 'SALU', 'OTHER'));

drop index if exists public.vehicle_journey_periods_one_open_type_uidx;

create unique index if not exists vehicle_journey_periods_one_open_state_uidx
  on public.vehicle_journey_periods (regnr)
  where ended_at is null;

create table public.vehicle_journey_activity_periods (
  activity_period_id uuid primary key default gen_random_uuid(),
  parent_period_id uuid not null references public.vehicle_journey_periods(period_id) on delete restrict,
  regnr text not null check (length(trim(regnr)) > 0),
  activity_type text not null
    check (activity_type in (
      'WORKSHOP',
      'SERVICE',
      'WAITING_PARTS',
      'TRANSPORT',
      'ADMINISTRATION',
      'MISSING_EQUIPMENT',
      'OTHER'
    )),
  started_at timestamptz not null,
  ended_at timestamptz,
  reason_text text,
  source_system text not null default 'INCHECKAD' check (length(trim(source_system)) > 0),
  source_entity text,
  source_record_id text,
  source_event_id uuid references public.vehicle_journey_events(event_id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index vehicle_journey_activity_periods_regnr_time_idx
  on public.vehicle_journey_activity_periods (regnr, started_at desc);
create index vehicle_journey_activity_periods_parent_time_idx
  on public.vehicle_journey_activity_periods (parent_period_id, started_at desc);
create unique index vehicle_journey_activity_periods_one_open_type_uidx
  on public.vehicle_journey_activity_periods (parent_period_id, activity_type)
  where ended_at is null;

alter table public.vehicle_journey_activity_periods enable row level security;
revoke all on public.vehicle_journey_activity_periods from public, anon, authenticated;
grant select, insert, update, delete on public.vehicle_journey_activity_periods to service_role;

create or replace function public.start_vehicle_journey_activity_period(
  p_activity_period_id uuid,
  p_parent_period_id uuid,
  p_regnr text,
  p_activity_type text,
  p_started_at timestamptz,
  p_reason_text text,
  p_source_system text,
  p_source_entity text,
  p_source_record_id text,
  p_actor_id uuid,
  p_actor_source text,
  p_actor_email text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_parent public.vehicle_journey_periods%rowtype;
  v_event_id uuid;
  v_activity public.vehicle_journey_activity_periods%rowtype;
begin
  if p_activity_type not in (
    'WORKSHOP', 'SERVICE', 'WAITING_PARTS', 'TRANSPORT',
    'ADMINISTRATION', 'MISSING_EQUIPMENT', 'OTHER'
  ) then
    raise exception 'Invalid journey activity type' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_source_system, ''))) = 0 then
    raise exception 'Source system is required' using errcode = '22023';
  end if;

  if p_actor_source not in ('SYSTEM', 'MANUELL', 'EXTERNAL') then
    raise exception 'Invalid actor source' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Activity metadata must be an object' using errcode = '22023';
  end if;

  select *
  into v_parent
  from public.vehicle_journey_periods
  where period_id = p_parent_period_id
    and regnr = p_regnr
  for update;

  if not found then
    raise exception 'Parent downtime period not found for vehicle' using errcode = 'P0002';
  end if;

  if v_parent.period_type <> 'DOWNTIME' then
    raise exception 'Journey activities require a DOWNTIME parent' using errcode = 'P0001';
  end if;

  if v_parent.ended_at is not null then
    raise exception 'Cannot start activity in a closed downtime period' using errcode = 'P0001';
  end if;

  if p_started_at < v_parent.started_at then
    raise exception 'Activity cannot start before parent downtime' using errcode = '22007';
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
    'ACTIVITY_PERIOD_STARTED',
    'vehicle-activity:' || p_activity_period_id::text || ':ACTIVITY_PERIOD_STARTED',
    p_started_at,
    trim(p_source_system),
    nullif(trim(coalesce(p_source_entity, '')), ''),
    nullif(trim(coalesce(p_source_record_id, '')), ''),
    p_actor_id,
    p_actor_source,
    p_actor_email,
    pg_catalog.jsonb_build_object(
      'activityPeriodId', p_activity_period_id,
      'parentPeriodId', p_parent_period_id,
      'activityType', p_activity_type,
      'startedAt', p_started_at,
      'reasonText', nullif(trim(coalesce(p_reason_text, '')), '')
    )
  )
  returning event_id into v_event_id;

  insert into public.vehicle_journey_activity_periods (
    activity_period_id,
    parent_period_id,
    regnr,
    activity_type,
    started_at,
    reason_text,
    source_system,
    source_entity,
    source_record_id,
    source_event_id,
    metadata,
    created_by
  ) values (
    p_activity_period_id,
    p_parent_period_id,
    p_regnr,
    p_activity_type,
    p_started_at,
    nullif(trim(coalesce(p_reason_text, '')), ''),
    trim(p_source_system),
    nullif(trim(coalesce(p_source_entity, '')), ''),
    nullif(trim(coalesce(p_source_record_id, '')), ''),
    v_event_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_actor_id
  )
  returning * into v_activity;

  return pg_catalog.jsonb_build_object(
    'activity_period_id', v_activity.activity_period_id,
    'parent_period_id', v_activity.parent_period_id,
    'activity_type', v_activity.activity_type,
    'started_at', v_activity.started_at,
    'ended_at', v_activity.ended_at,
    'reason_text', v_activity.reason_text,
    'source_system', v_activity.source_system,
    'source_event_id', v_activity.source_event_id,
    'metadata', v_activity.metadata,
    'created_at', v_activity.created_at,
    'updated_at', v_activity.updated_at
  );
end;
$$;

create or replace function public.close_vehicle_journey_activity_period(
  p_activity_period_id uuid,
  p_regnr text,
  p_ended_at timestamptz,
  p_source_system text,
  p_source_entity text,
  p_source_record_id text,
  p_actor_id uuid,
  p_actor_source text,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_activity public.vehicle_journey_activity_periods%rowtype;
  v_parent public.vehicle_journey_periods%rowtype;
  v_duration_hours numeric;
begin
  select *
  into v_activity
  from public.vehicle_journey_activity_periods
  where activity_period_id = p_activity_period_id
    and regnr = p_regnr
  for update;

  if not found then
    raise exception 'Journey activity not found for vehicle' using errcode = 'P0002';
  end if;

  if v_activity.ended_at is not null then
    raise exception 'Journey activity is already closed' using errcode = 'P0001';
  end if;

  select *
  into v_parent
  from public.vehicle_journey_periods
  where period_id = v_activity.parent_period_id
  for update;

  if not found then
    raise exception 'Parent downtime period not found' using errcode = 'P0002';
  end if;

  if p_ended_at < v_activity.started_at then
    raise exception 'Activity end cannot be before activity start' using errcode = '22007';
  end if;

  if v_parent.ended_at is not null and p_ended_at > v_parent.ended_at then
    raise exception 'Activity cannot end after parent downtime' using errcode = '22007';
  end if;

  update public.vehicle_journey_activity_periods
  set ended_at = p_ended_at,
      updated_at = pg_catalog.now()
  where activity_period_id = p_activity_period_id
  returning * into v_activity;

  v_duration_hours := pg_catalog.round(
    (extract(epoch from (p_ended_at - v_activity.started_at)) / 3600.0)::numeric,
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
    'ACTIVITY_PERIOD_ENDED',
    'vehicle-activity:' || p_activity_period_id::text || ':ACTIVITY_PERIOD_ENDED',
    p_ended_at,
    trim(p_source_system),
    nullif(trim(coalesce(p_source_entity, '')), ''),
    nullif(trim(coalesce(p_source_record_id, '')), ''),
    p_actor_id,
    p_actor_source,
    p_actor_email,
    pg_catalog.jsonb_build_object(
      'activityPeriodId', v_activity.activity_period_id,
      'parentPeriodId', v_activity.parent_period_id,
      'activityType', v_activity.activity_type,
      'startedAt', v_activity.started_at,
      'endedAt', p_ended_at,
      'durationHours', v_duration_hours,
      'reasonText', v_activity.reason_text
    )
  );

  return pg_catalog.jsonb_build_object(
    'activity_period_id', v_activity.activity_period_id,
    'parent_period_id', v_activity.parent_period_id,
    'activity_type', v_activity.activity_type,
    'started_at', v_activity.started_at,
    'ended_at', v_activity.ended_at,
    'reason_text', v_activity.reason_text,
    'source_system', v_activity.source_system,
    'source_event_id', v_activity.source_event_id,
    'metadata', v_activity.metadata,
    'created_at', v_activity.created_at,
    'updated_at', v_activity.updated_at,
    'durationHours', v_duration_hours
  );
end;
$$;

create or replace function public.transition_vehicle_journey_state(
  p_period_id uuid,
  p_regnr text,
  p_period_type text,
  p_started_at timestamptz,
  p_reason_code text,
  p_reason_text text,
  p_source_system text,
  p_source_entity text,
  p_source_record_id text,
  p_actor_id uuid,
  p_actor_source text,
  p_actor_email text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current public.vehicle_journey_periods%rowtype;
  v_new public.vehicle_journey_periods%rowtype;
  v_start_event_id uuid;
  v_duration_hours numeric;
  v_activity record;
begin
  if p_period_type not in ('PREPARATION', 'AVAILABLE', 'RENTAL', 'DOWNTIME', 'SALU', 'OTHER') then
    raise exception 'Invalid vehicle journey state' using errcode = '22023';
  end if;

  if p_period_type = 'DOWNTIME' then
    if p_reason_code not in (
      'DAMAGE', 'WORKSHOP', 'SERVICE', 'WAITING_PARTS',
      'MISSING_EQUIPMENT', 'TRANSPORT', 'ADMINISTRATION', 'OTHER'
    ) then
      raise exception 'Downtime requires a valid reason' using errcode = '22023';
    end if;
    if p_reason_code = 'OTHER' and length(trim(coalesce(p_reason_text, ''))) = 0 then
      raise exception 'Other downtime requires a comment' using errcode = '22023';
    end if;
  end if;

  if length(trim(coalesce(p_source_system, ''))) = 0 then
    raise exception 'Source system is required' using errcode = '22023';
  end if;

  if p_actor_source not in ('SYSTEM', 'MANUELL', 'EXTERNAL') then
    raise exception 'Invalid actor source' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Period metadata must be an object' using errcode = '22023';
  end if;

  select *
  into v_current
  from public.vehicle_journey_periods
  where regnr = p_regnr
    and ended_at is null
  for update;

  if found then
    if p_started_at < v_current.started_at then
      raise exception 'Transition time cannot be before current state start' using errcode = '22007';
    end if;

    if v_current.period_type = p_period_type
      and coalesce(v_current.reason_code, '') = coalesce(p_reason_code, '')
      and coalesce(v_current.reason_text, '') = coalesce(nullif(trim(coalesce(p_reason_text, '')), ''), '') then
      raise exception 'Vehicle is already in requested state' using errcode = 'P0001';
    end if;

    if v_current.period_type = 'DOWNTIME' then
      for v_activity in
        select activity_period_id
        from public.vehicle_journey_activity_periods
        where parent_period_id = v_current.period_id
          and ended_at is null
        order by started_at, activity_period_id
        for update
      loop
        perform public.close_vehicle_journey_activity_period(
          v_activity.activity_period_id,
          p_regnr,
          p_started_at,
          p_source_system,
          p_source_entity,
          p_source_record_id,
          p_actor_id,
          p_actor_source,
          p_actor_email
        );
      end loop;
    end if;

    update public.vehicle_journey_periods
    set ended_at = p_started_at,
        updated_at = pg_catalog.now()
    where period_id = v_current.period_id;

    v_duration_hours := pg_catalog.round(
      (extract(epoch from (p_started_at - v_current.started_at)) / 3600.0)::numeric,
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
      'vehicle-period:' || v_current.period_id::text || ':PERIOD_ENDED',
      p_started_at,
      trim(p_source_system),
      nullif(trim(coalesce(p_source_entity, '')), ''),
      nullif(trim(coalesce(p_source_record_id, '')), ''),
      p_actor_id,
      p_actor_source,
      p_actor_email,
      pg_catalog.jsonb_build_object(
        'periodType', v_current.period_type,
        'startedAt', v_current.started_at,
        'endedAt', p_started_at,
        'durationHours', v_duration_hours,
        'reasonCode', v_current.reason_code,
        'reasonText', v_current.reason_text,
        'transitionedTo', p_period_type
      )
    );
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
    'vehicle-period:' || p_period_id::text || ':PERIOD_STARTED',
    p_started_at,
    trim(p_source_system),
    nullif(trim(coalesce(p_source_entity, '')), ''),
    nullif(trim(coalesce(p_source_record_id, '')), ''),
    p_actor_id,
    p_actor_source,
    p_actor_email,
    pg_catalog.jsonb_build_object(
      'periodType', p_period_type,
      'startedAt', p_started_at,
      'reasonCode', p_reason_code,
      'reasonText', nullif(trim(coalesce(p_reason_text, '')), ''),
      'transitionedFromPeriodId', case when v_current.period_id is null then null else v_current.period_id end
    )
  )
  returning event_id into v_start_event_id;

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
    nullif(trim(coalesce(p_reason_text, '')), ''),
    trim(p_source_system),
    nullif(trim(coalesce(p_source_entity, '')), ''),
    nullif(trim(coalesce(p_source_record_id, '')), ''),
    v_start_event_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_actor_id
  )
  returning * into v_new;

  return pg_catalog.jsonb_build_object(
    'previousPeriodId', case when v_current.period_id is null then null else v_current.period_id end,
    'period', pg_catalog.jsonb_build_object(
      'period_id', v_new.period_id,
      'period_type', v_new.period_type,
      'started_at', v_new.started_at,
      'ended_at', v_new.ended_at,
      'reason_code', v_new.reason_code,
      'reason_text', v_new.reason_text,
      'source_system', v_new.source_system,
      'source_event_id', v_new.source_event_id,
      'metadata', v_new.metadata,
      'created_at', v_new.created_at,
      'updated_at', v_new.updated_at
    )
  );
end;
$$;

-- Keep the legacy start RPC callable while making its semantics match the new
-- one-state model. Existing callers therefore cannot reopen parallel states.
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
  v_result jsonb;
begin
  v_result := public.transition_vehicle_journey_state(
    p_period_id,
    p_regnr,
    p_period_type,
    p_started_at,
    p_reason_code,
    p_reason_text,
    'VAGNKORT',
    'vehicle_journey_periods',
    p_period_id::text,
    p_actor_id,
    'MANUELL',
    p_actor_email,
    '{"createdVia":"VAGNKORT"}'::jsonb
  );
  return v_result -> 'period';
end;
$$;

-- Closing a DOWNTIME state directly also closes any still-open child
-- activities at the same timestamp, so a child can never outlive its parent.
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
  v_activity record;
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

  if v_period.period_type = 'DOWNTIME' then
    for v_activity in
      select activity_period_id
      from public.vehicle_journey_activity_periods
      where parent_period_id = v_period.period_id
        and ended_at is null
      order by started_at, activity_period_id
      for update
    loop
      perform public.close_vehicle_journey_activity_period(
        v_activity.activity_period_id,
        p_regnr,
        p_ended_at,
        'VAGNKORT',
        'vehicle_journey_periods',
        p_period_id::text,
        p_actor_id,
        'MANUELL',
        p_actor_email
      );
    end loop;
  end if;

  update public.vehicle_journey_periods
  set ended_at = p_ended_at,
      updated_at = pg_catalog.now()
  where period_id = p_period_id
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

revoke all on function public.start_vehicle_journey_activity_period(uuid, uuid, text, text, timestamptz, text, text, text, text, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.close_vehicle_journey_activity_period(uuid, text, timestamptz, text, text, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.transition_vehicle_journey_state(uuid, text, text, timestamptz, text, text, text, text, text, uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.start_vehicle_journey_activity_period(uuid, uuid, text, text, timestamptz, text, text, text, text, uuid, text, text, jsonb)
  to service_role;
grant execute on function public.close_vehicle_journey_activity_period(uuid, text, timestamptz, text, text, text, uuid, text, text)
  to service_role;
grant execute on function public.transition_vehicle_journey_state(uuid, text, text, timestamptz, text, text, text, text, text, uuid, text, text, jsonb)
  to service_role;

commit;
