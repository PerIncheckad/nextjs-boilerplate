begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Step B: source-aware Layer 1 closure for trusted system adapters.
-- Legacy Vagnkort close semantics remain untouched. This adapter preserves the
-- actual source event instead of falsely attributing an AVVECKLA terminal to VAGNKORT.
create or replace function public.close_vehicle_journey_period_from_source(
  p_period_id uuid,
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
  v_period public.vehicle_journey_periods%rowtype;
  v_duration_hours numeric;
  v_activity record;
begin
  if length(trim(coalesce(p_source_system, ''))) = 0 then
    raise exception 'Source system is required' using errcode = '22023';
  end if;
  if p_actor_source not in ('SYSTEM', 'MANUELL', 'EXTERNAL') then
    raise exception 'Invalid actor source' using errcode = '22023';
  end if;

  select * into v_period
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
    trim(p_source_system),
    nullif(trim(coalesce(p_source_entity, '')), ''),
    nullif(trim(coalesce(p_source_record_id, '')), ''),
    p_actor_id,
    p_actor_source,
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

-- Three explicit terminal handoffs. Readiness is owned exclusively by
-- assert_garage_avveckla_ready_for_completion(). No parallel readiness logic.
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
  v_normalized_regnr text;
  v_evidence text := nullif(trim(coalesce(p_evidence_reference, '')), '');
  v_method text;
  v_period_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor is null then
    raise exception 'Aktör krävs' using errcode = '22023';
  end if;
  if p_occurred_at is null then
    raise exception 'Verklig tidpunkt för UT-händelsen krävs' using errcode = '22023';
  end if;
  if v_evidence is null then
    raise exception 'Evidensreferens krävs för verifierat UT' using errcode = '22023';
  end if;

  v_method := case p_event_type
    when 'UT_OVERLAMNING_VERIFIERAD' then 'EGEN_LEVERANS'
    when 'UT_TRANSPORTOR_HAMTAT_VERIFIERAD' then 'EXTERN_TRANSPORT'
    when 'UT_AVSTALLNING_VERIFIERAD' then 'AVSTALLNING'
    else null
  end;

  if v_method is null then
    raise exception 'Ogiltig terminal UT-händelse' using errcode = '22023';
  end if;

  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage-objektet finns inte' using errcode = 'P0002';
  end if;
  if v_item.garage_direction <> 'UT' then
    raise exception 'Terminalt UT kräver Garage-riktning UT' using errcode = 'P0001';
  end if;
  if v_item.voided_at is not null then
    raise exception 'Makulerat Garage-objekt kan inte avslutas som verifierat UT' using errcode = 'P0001';
  end if;
  if v_item.handed_off_nybil_id is not null then
    raise exception 'Garage-objektet är redan överlämnat till Ny bil' using errcode = 'P0001';
  end if;
  if v_item.completed_at is not null then
    raise exception 'Garage-objektet är redan verifierat UT och avslutat' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(v_item.regnr, '')), '') is null then
    raise exception 'Verifierat UT kräver registreringsnummer' using errcode = 'P0001';
  end if;

  v_normalized_regnr := upper(regexp_replace(v_item.regnr, '\s+', '', 'g'));

  -- LOCKED GATE. This is the only readiness gate between AVVECKLA work and UT.
  v_avveckla_case_id := public.assert_garage_avveckla_ready_for_completion(p_garage_item_id);

  select * into v_case
  from public.garage_avveckla_cases
  where avveckla_case_id = v_avveckla_case_id
  for update;

  if v_case.regnr <> v_normalized_regnr then
    raise exception 'AVVECKLA/Garage regnr mismatch' using errcode = 'P0001';
  end if;

  -- Layer 1 owns current operational truth. Resolve the one current open period
  -- from Layer 1 itself; never infer it from Garage dates or statuses.
  select count(*) into v_period_count
  from public.vehicle_journey_periods
  where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_normalized_regnr
    and ended_at is null;

  if v_period_count = 0 then
    raise exception 'Aktuell öppen fordonsperiod saknas; UT får inte fabricera Layer 1-historik' using errcode = 'P0002';
  end if;
  if v_period_count > 1 then
    raise exception 'Flera öppna fordonsperioder finns för bilen; UT stoppas' using errcode = 'P0001';
  end if;

  select * into v_period
  from public.vehicle_journey_periods
  where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_normalized_regnr
    and ended_at is null
  for update;

  if p_occurred_at < v_period.started_at then
    raise exception 'UT-händelsen kan inte inträffa före aktuell fordonsperiod' using errcode = '22007';
  end if;

  insert into public.garage_avveckla_events (
    avveckla_case_id,
    garage_item_id,
    regnr,
    event_type,
    event_key,
    occurred_at,
    actor_id,
    actor_email,
    actor_source,
    evidence_reference,
    payload
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

  -- Source-controlled Layer 1 write-through. PERIOD_ENDED points back to the
  -- immutable terminal AVVECKLA event rather than pretending this came from UI.
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
    'journey_period_id', v_period.period_id,
    'completed_at', p_occurred_at
  );
end;
$$;

create or replace function public.verify_garage_avveckla_egen_leverans(
  p_garage_item_id uuid,
  p_occurred_at timestamptz,
  p_evidence_reference text,
  p_actor uuid,
  p_actor_email text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select public.complete_garage_avveckla_ut_internal(
    p_garage_item_id,
    'UT_OVERLAMNING_VERIFIERAD',
    p_occurred_at,
    p_evidence_reference,
    p_actor,
    p_actor_email
  );
$$;

create or replace function public.verify_garage_avveckla_extern_transport(
  p_garage_item_id uuid,
  p_occurred_at timestamptz,
  p_evidence_reference text,
  p_actor uuid,
  p_actor_email text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select public.complete_garage_avveckla_ut_internal(
    p_garage_item_id,
    'UT_TRANSPORTOR_HAMTAT_VERIFIERAD',
    p_occurred_at,
    p_evidence_reference,
    p_actor,
    p_actor_email
  );
$$;

create or replace function public.verify_garage_avveckla_avstallning(
  p_garage_item_id uuid,
  p_occurred_at timestamptz,
  p_evidence_reference text,
  p_actor uuid,
  p_actor_email text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select public.complete_garage_avveckla_ut_internal(
    p_garage_item_id,
    'UT_AVSTALLNING_VERIFIERAD',
    p_occurred_at,
    p_evidence_reference,
    p_actor,
    p_actor_email
  );
$$;

revoke all on function public.close_vehicle_journey_period_from_source(uuid,text,timestamptz,text,text,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.complete_garage_avveckla_ut_internal(uuid,text,timestamptz,text,uuid,text) from public, anon, authenticated;
revoke all on function public.verify_garage_avveckla_egen_leverans(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;
revoke all on function public.verify_garage_avveckla_extern_transport(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;
revoke all on function public.verify_garage_avveckla_avstallning(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;

grant execute on function public.close_vehicle_journey_period_from_source(uuid,text,timestamptz,text,text,text,uuid,text,text) to service_role;
grant execute on function public.complete_garage_avveckla_ut_internal(uuid,text,timestamptz,text,uuid,text) to service_role;
grant execute on function public.verify_garage_avveckla_egen_leverans(uuid,timestamptz,text,uuid,text) to service_role;
grant execute on function public.verify_garage_avveckla_extern_transport(uuid,timestamptz,text,uuid,text) to service_role;
grant execute on function public.verify_garage_avveckla_avstallning(uuid,timestamptz,text,uuid,text) to service_role;

comment on function public.close_vehicle_journey_period_from_source(uuid,text,timestamptz,text,text,text,uuid,text,text) is
  'Trusted source adapter for closing one exact Layer 1 period while preserving source provenance in PERIOD_ENDED.';
comment on function public.complete_garage_avveckla_ut_internal(uuid,text,timestamptz,text,uuid,text) is
  'Atomic terminal UT handoff. Must pass assert_garage_avveckla_ready_for_completion(), append immutable UT evidence, source-close the one current Layer 1 period, create PERIOD_ENDED, and freeze the exact Garage episode.';

commit;
