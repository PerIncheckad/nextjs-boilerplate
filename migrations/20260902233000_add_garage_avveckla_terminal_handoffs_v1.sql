begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Step B: three explicit, source-controlled terminal UT handoffs.
-- The readiness decision is owned exclusively by
-- assert_garage_avveckla_ready_for_completion(). This function must not be
-- duplicated or reimplemented here.

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

  -- Lock the exact Garage episode first. No terminal can race another terminal
  -- or mutate a completed/voided/Nybil-handed-off episode.
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

  -- LOCKED GATE. Do not replace this call with local OPEN-point logic.
  v_avveckla_case_id := public.assert_garage_avveckla_ready_for_completion(p_garage_item_id);

  select * into v_case
  from public.garage_avveckla_cases
  where avveckla_case_id = v_avveckla_case_id
  for update;

  if v_case.regnr <> v_normalized_regnr then
    raise exception 'AVVECKLA/Garage regnr mismatch' using errcode = 'P0001';
  end if;

  -- Layer 1 owns current operational truth. Resolve and lock the one current
  -- open period from Layer 1 itself; never infer it from Garage timestamps.
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

  -- Immutable operational proof first. Its id becomes the source reference for
  -- the Layer 1 PERIOD_ENDED event and the Garage completion.
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

  -- Source-controlled write-through. Existing Layer 1 close function remains
  -- owner of period closure, child-activity closure and PERIOD_ENDED creation.
  perform public.close_vehicle_journey_period(
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

revoke all on function public.complete_garage_avveckla_ut_internal(uuid,text,timestamptz,text,uuid,text) from public, anon, authenticated;
revoke all on function public.verify_garage_avveckla_egen_leverans(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;
revoke all on function public.verify_garage_avveckla_extern_transport(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;
revoke all on function public.verify_garage_avveckla_avstallning(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;

grant execute on function public.complete_garage_avveckla_ut_internal(uuid,text,timestamptz,text,uuid,text) to service_role;
grant execute on function public.verify_garage_avveckla_egen_leverans(uuid,timestamptz,text,uuid,text) to service_role;
grant execute on function public.verify_garage_avveckla_extern_transport(uuid,timestamptz,text,uuid,text) to service_role;
grant execute on function public.verify_garage_avveckla_avstallning(uuid,timestamptz,text,uuid,text) to service_role;

comment on function public.complete_garage_avveckla_ut_internal(uuid,text,timestamptz,text,uuid,text) is
  'Atomic terminal UT handoff. Must pass assert_garage_avveckla_ready_for_completion(), append immutable UT evidence, close the one current Layer 1 period through close_vehicle_journey_period(), and freeze the exact Garage episode.';

commit;
