create or replace function public.materialize_salu_to_garage(
  p_flag_id uuid,
  p_direction text,
  p_station text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_direction text := upper(nullif(btrim(p_direction), ''));
  v_station text := nullif(btrim(p_station), '');
  v_flag public.salu_flags;
  v_vehicle public.vehicles;
  v_existing public.garage_items;
  v_item public.garage_items;
  v_model text;
  v_note text;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor is null then
    raise exception 'Aktör krävs';
  end if;
  if p_flag_id is null then
    raise exception 'SALU-cykel krävs';
  end if;
  if v_direction not in ('IN', 'UT') then
    raise exception 'Ogiltig riktning';
  end if;
  if v_station is null then
    raise exception 'Planerad station krävs';
  end if;

  perform pg_advisory_xact_lock(hashtext('garage-salu:' || p_flag_id::text));

  if not exists (
    select 1
    from public.planning_stations s
    where s.station_code = v_station
      and s.is_active = true
  ) then
    raise exception 'Planerad station är inte aktiv';
  end if;

  select * into v_flag
  from public.salu_flags
  where flag_id = p_flag_id;

  if not found then
    raise exception 'SALU-cykeln finns inte';
  end if;

  select * into v_existing
  from public.garage_items
  where source_kind = 'SALU'
    and source_salu_flag_id = p_flag_id
    and voided_at is null
  limit 1;

  if found then
    return jsonb_build_object(
      'already_exists', true,
      'data', to_jsonb(v_existing)
    );
  end if;

  select * into v_vehicle
  from public.vehicles
  where regnr = v_flag.regnr
  limit 1;

  v_model := nullif(btrim(concat_ws(' ', v_vehicle.brand, v_vehicle.model)), '');
  if v_model is null then
    v_model := v_flag.regnr;
  end if;

  v_note := nullif(
    concat_ws(' · ', nullif(btrim(v_flag.closure_comment), ''), 'Hämtad från SALU ' || v_flag.current_saludatum::text),
    ''
  );

  insert into public.garage_items (
    planning_period,
    model,
    garage_direction,
    planning_reason,
    regnr,
    source_regnr,
    planned_station,
    confirmation_status,
    transport_status,
    source_kind,
    source_salu_flag_id,
    note,
    created_at,
    updated_at,
    created_by,
    updated_by
  ) values (
    to_char(v_flag.current_saludatum, 'YYYY-MM'),
    v_model,
    v_direction,
    'SALU',
    v_flag.regnr,
    v_flag.regnr,
    v_station,
    'PLANERAD',
    'EJ_BOKAD',
    'SALU',
    v_flag.flag_id,
    v_note,
    v_now,
    v_now,
    p_actor,
    p_actor
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
    v_direction,
    'Hämtad från SALU',
    v_now,
    p_actor
  );

  return jsonb_build_object(
    'already_exists', false,
    'data', to_jsonb(v_item)
  );
end;
$$;

revoke all on function public.materialize_salu_to_garage(uuid, text, text, uuid) from public;
revoke all on function public.materialize_salu_to_garage(uuid, text, text, uuid) from anon;
revoke all on function public.materialize_salu_to_garage(uuid, text, text, uuid) from authenticated;
grant execute on function public.materialize_salu_to_garage(uuid, text, text, uuid) to service_role;

comment on function public.materialize_salu_to_garage(uuid, text, text, uuid)
is 'Atomically validates and materializes one active SALU source into Garage together with its initial direction audit event.';
