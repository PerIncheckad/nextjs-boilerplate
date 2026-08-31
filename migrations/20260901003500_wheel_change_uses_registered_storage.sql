begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.create_garage_wheel_change_for_vehicle(
  p_regnr text,
  p_season_key text,
  p_target_wheel_type text,
  p_note text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_definition public.checkpoint_definitions%rowtype;
  v_checkpoint public.vehicle_checkpoints%rowtype;
  v_change public.garage_wheel_changes%rowtype;
  v_wheel_change_id uuid := gen_random_uuid();
  v_regnr text;
  v_season_key text;
  v_storage_location text;
begin
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  v_season_key := upper(trim(coalesce(p_season_key, '')));

  if length(v_regnr) = 0 then
    raise exception 'Registreringsnummer krävs för hjulskifte' using errcode = '22023';
  end if;
  if length(v_season_key) = 0 then
    raise exception 'Säsong krävs för hjulskifte' using errcode = '22023';
  end if;
  if p_target_wheel_type not in ('Vinterdäck', 'Sommardäck') then
    raise exception 'Ogiltig hjultyp för hjulskifte' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.garage_wheel_changes
    where regnr = v_regnr
      and season_key = v_season_key
  ) then
    raise exception 'Hjulskifte finns redan för bilen och säsongen' using errcode = 'P0001';
  end if;

  with latest_nybil as (
    select
      nullif(trim(n.hjul_forvaring_ort), '') as storage_ort,
      nullif(trim(coalesce(n.hjul_forvaring_spec, n.hjul_forvaring)), '') as storage_spec
    from public.nybil_inventering n
    where upper(regexp_replace(n.regnr, '\s+', '', 'g')) = v_regnr
    order by n.created_at desc
    limit 1
  ),
  latest_ort_edit as (
    select nullif(trim(e.new_value), '') as value
    from public.vehicle_edits e
    where upper(regexp_replace(e.regnr, '\s+', '', 'g')) = v_regnr
      and e.field_name = 'hjul_forvaring_ort'
    order by e.edited_at desc
    limit 1
  ),
  latest_spec_edit as (
    select nullif(trim(e.new_value), '') as value
    from public.vehicle_edits e
    where upper(regexp_replace(e.regnr, '\s+', '', 'g')) = v_regnr
      and e.field_name = 'hjul_forvaring_spec'
    order by e.edited_at desc
    limit 1
  ),
  current_storage as (
    select nullif(
      concat_ws(
        ' - ',
        coalesce((select value from latest_ort_edit), (select storage_ort from latest_nybil)),
        coalesce((select value from latest_spec_edit), (select storage_spec from latest_nybil))
      ),
      ''
    ) as value
  ),
  legacy_storage as (
    select nullif(trim(v.wheel_storage_location), '') as value
    from public.vehicles v
    where upper(regexp_replace(v.regnr, '\s+', '', 'g')) = v_regnr
      and nullif(trim(v.wheel_storage_location), '') is not null
    limit 1
  )
  select coalesce(
    (select value from current_storage),
    (select value from legacy_storage)
  )
  into v_storage_location;

  select * into v_definition
  from public.checkpoint_definitions
  where checkpoint_code = 'HJULSKIFTE' and active
  order by definition_version desc
  limit 1;

  if not found then
    raise exception 'Active HJULSKIFTE checkpoint definition not found' using errcode = 'P0002';
  end if;

  insert into public.vehicle_checkpoints (
    regnr,
    checkpoint_code,
    definition_version,
    cycle_key,
    due_at,
    source_context,
    created_by,
    updated_by
  ) values (
    v_regnr,
    v_definition.checkpoint_code,
    v_definition.definition_version,
    'wheel-season:' || lower(v_season_key) || ':' || v_regnr,
    null,
    jsonb_build_object(
      'wheelChangeId', v_wheel_change_id,
      'seasonKey', v_season_key,
      'targetWheelType', p_target_wheel_type,
      'wheelStorageLocation', v_storage_location,
      'source', 'HJULSKIFTE_SEASON'
    ),
    p_actor_id,
    p_actor_id
  ) returning * into v_checkpoint;

  insert into public.garage_wheel_changes (
    wheel_change_id,
    garage_item_id,
    regnr,
    checkpoint_id,
    status,
    season_key,
    target_wheel_type,
    location,
    note,
    created_by,
    created_by_email,
    updated_by,
    updated_by_email
  ) values (
    v_wheel_change_id,
    null,
    v_regnr,
    v_checkpoint.checkpoint_id,
    'KRAVS',
    v_season_key,
    p_target_wheel_type,
    v_storage_location,
    nullif(trim(coalesce(p_note, '')), ''),
    p_actor_id,
    p_actor_email,
    p_actor_id,
    p_actor_email
  ) returning * into v_change;

  insert into public.garage_wheel_change_events (
    wheel_change_id, event_type, previous_status, status, snapshot, actor_id, actor_email
  ) values (
    v_change.wheel_change_id,
    'CREATED',
    null,
    v_change.status,
    jsonb_build_object(
      'regnr', v_change.regnr,
      'checkpointId', v_change.checkpoint_id,
      'seasonKey', v_change.season_key,
      'targetWheelType', v_change.target_wheel_type,
      'location', v_change.location,
      'note', v_change.note
    ),
    p_actor_id,
    p_actor_email
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
    v_regnr,
    'CHECKPOINT_CREATED',
    'checkpoint-created:' || v_checkpoint.checkpoint_id::text,
    now(),
    'CHECKPOINT_ENGINE',
    'vehicle_checkpoints',
    v_checkpoint.checkpoint_id::text,
    p_actor_id,
    'MANUELL',
    p_actor_email,
    jsonb_build_object(
      'checkpointId', v_checkpoint.checkpoint_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'definitionVersion', v_checkpoint.definition_version,
      'cycleKey', v_checkpoint.cycle_key,
      'blocking', v_definition.blocking,
      'verificationMode', v_definition.verification_mode,
      'seasonKey', v_season_key,
      'targetWheelType', p_target_wheel_type,
      'wheelStorageLocation', v_storage_location,
      'source', 'HJULSKIFTE_SEASON'
    )
  );

  return to_jsonb(v_change);
end;
$$;

revoke all on function public.create_garage_wheel_change_for_vehicle(text, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_garage_wheel_change_for_vehicle(text, text, text, text, uuid, text)
  to service_role;

commit;
