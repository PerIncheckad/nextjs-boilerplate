begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Future-only bridge for the verified SALU closure decision SÄLJAS.
-- SALU remains the source of the decision. The bridge only materializes the
-- exact SALU cycle as Garage direction UT and verifies receipt by Garage.
-- AVVECKLA itself remains manually started through start_garage_avveckla_case().
-- No historical backfill, no invented station, no Layer 1 or RENTAL writes.

insert into public.handoff_definitions (
  handoff_code,
  handoff_version,
  routine_code,
  routine_version,
  title,
  description,
  from_function,
  to_function,
  verification_mode,
  blocking,
  active
) values (
  'SALU_TO_GARAGE_SALJAS',
  1,
  'SALU_CYCLE',
  1,
  'SALU SÄLJAS till Garage UT',
  'Atomiskt handslag från källägt SALU-beslut SÄLJAS till ett Garage-objekt med riktning UT. AVVECKLA startas därefter manuellt i Garaget.',
  'BILKONTROLL',
  'GARAGE',
  'SYSTEM',
  true,
  true
)
on conflict (handoff_code, handoff_version) do nothing;

create or replace function public.materialize_salu_saljas_to_garage_ut_v1(
  p_flag_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_flag public.salu_flags%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_item public.garage_items%rowtype;
  v_handoff jsonb;
  v_handoff_id uuid;
  v_model text;
  v_previous_direction text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_flag_id is null then
    raise exception 'SALU-cykel krävs' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('salu-saljas-garage-ut:' || p_flag_id::text)
  );

  select * into v_flag
  from public.salu_flags
  where flag_id = p_flag_id
  for update;

  if not found then
    raise exception 'SALU-cykeln finns inte' using errcode = 'P0002';
  end if;

  if v_flag.status <> 'STÄNGD' or v_flag.closure_outcome <> 'SÄLJAS' then
    raise exception 'Garage-handslag kräver stängd SALU med beslut SÄLJAS' using errcode = 'P0001';
  end if;

  if v_flag.closed_by is null or v_flag.closed_at is null then
    raise exception 'SÄLJAS-beslutet saknar verifierad avslutsaktör eller tid' using errcode = 'P0001';
  end if;

  select * into v_item
  from public.garage_items
  where source_kind = 'SALU'
    and source_salu_flag_id = v_flag.flag_id
    and voided_at is null
  for update;

  if found then
    if v_item.completed_at is not null then
      raise exception 'SALU-källat Garage-objekt är redan avslutat' using errcode = 'P0001';
    end if;

    if v_item.handed_off_nybil_id is not null then
      raise exception 'SALU-källat Garage-objekt är redan överlämnat till Ny bil' using errcode = 'P0001';
    end if;

    if v_item.garage_direction is distinct from 'UT' then
      v_previous_direction := v_item.garage_direction;

      update public.garage_items
      set garage_direction = 'UT',
          planning_reason = 'SALU',
          updated_at = v_now,
          updated_by = v_flag.closed_by
      where garage_item_id = v_item.garage_item_id
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
        v_previous_direction,
        'UT',
        'SALU beslut SÄLJAS',
        v_now,
        v_flag.closed_by
      );
    end if;
  else
    select * into v_vehicle
    from public.vehicles
    where upper(pg_catalog.regexp_replace(regnr, '\s+', '', 'g')) =
          upper(pg_catalog.regexp_replace(v_flag.regnr, '\s+', '', 'g'))
    limit 1;

    v_model := nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', v_vehicle.brand, v_vehicle.model)), '');
    if v_model is null then
      v_model := upper(pg_catalog.regexp_replace(v_flag.regnr, '\s+', '', 'g'));
    end if;

    insert into public.garage_items (
      planning_period,
      model,
      garage_direction,
      planning_reason,
      regnr,
      source_regnr,
      source_kind,
      source_salu_flag_id,
      note,
      created_at,
      updated_at,
      created_by,
      updated_by
    ) values (
      pg_catalog.to_char(v_flag.current_saludatum, 'YYYY-MM'),
      v_model,
      'UT',
      'SALU',
      upper(pg_catalog.regexp_replace(v_flag.regnr, '\s+', '', 'g')),
      upper(pg_catalog.regexp_replace(v_flag.regnr, '\s+', '', 'g')),
      'SALU',
      v_flag.flag_id,
      nullif(
        pg_catalog.concat_ws(
          ' · ',
          'SALU beslut SÄLJAS',
          nullif(pg_catalog.btrim(v_flag.closure_comment), '')
        ),
        ''
      ),
      v_now,
      v_now,
      v_flag.closed_by,
      v_flag.closed_by
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
      'SALU beslut SÄLJAS',
      v_now,
      v_flag.closed_by
    );
  end if;

  v_handoff := public.ensure_handoff_from_source(
    'SALU_TO_GARAGE_SALJAS',
    v_flag.regnr,
    'SALU',
    'salu_flags',
    v_flag.flag_id::text,
    'salu-manual-close:' || v_flag.flag_id::text,
    pg_catalog.jsonb_build_object(
      'flagId', v_flag.flag_id,
      'closureOutcome', v_flag.closure_outcome,
      'closedAt', v_flag.closed_at,
      'garageItemId', v_item.garage_item_id,
      'nextAction', 'START_AVVECKLA_MANUALLY'
    )
  );

  v_handoff_id := (v_handoff ->> 'handoff_id')::uuid;

  if (v_handoff ->> 'status') = 'REQUESTED' then
    perform public.transition_handoff(
      v_handoff_id, 'HANDED_OVER', 'SALU beslut SÄLJAS', '[]'::jsonb,
      v_flag.closed_by, null, 'SYSTEM'
    );
    perform public.transition_handoff(
      v_handoff_id, 'RECEIVED', 'Garage UT materialiserat', '[]'::jsonb,
      v_flag.closed_by, null, 'SYSTEM'
    );
    perform public.transition_handoff(
      v_handoff_id, 'ACCEPTED', 'Garage har mottagit SÄLJAS-ansvaret', '[]'::jsonb,
      v_flag.closed_by, null, 'SYSTEM'
    );
    perform public.transition_handoff(
      v_handoff_id, 'COMPLETED', 'Garage-objekt etablerat', '[]'::jsonb,
      v_flag.closed_by, null, 'SYSTEM'
    );
    perform public.transition_handoff(
      v_handoff_id, 'VERIFIED', 'SALU → Garage UT verifierat atomiskt', '[]'::jsonb,
      v_flag.closed_by, null, 'SYSTEM'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'flagId', v_flag.flag_id,
    'garageItemId', v_item.garage_item_id,
    'handoffId', v_handoff_id,
    'avvecklaStarted', false
  );
end;
$$;

create or replace function public.write_through_salu_saljas_to_garage_ut_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status = 'STÄNGD'
     and new.closure_outcome = 'SÄLJAS'
     and (
       old.status is distinct from new.status
       or old.closure_outcome is distinct from new.closure_outcome
     ) then
    perform public.materialize_salu_saljas_to_garage_ut_v1(new.flag_id);
  end if;

  return new;
end;
$$;

drop trigger if exists salu_saljas_to_garage_ut_write_through on public.salu_flags;
create trigger salu_saljas_to_garage_ut_write_through
after update of status, closure_outcome on public.salu_flags
for each row
execute function public.write_through_salu_saljas_to_garage_ut_v1();

revoke all on function public.materialize_salu_saljas_to_garage_ut_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.write_through_salu_saljas_to_garage_ut_v1()
  from public, anon, authenticated;

grant execute on function public.materialize_salu_saljas_to_garage_ut_v1(uuid)
  to service_role;
grant execute on function public.write_through_salu_saljas_to_garage_ut_v1()
  to service_role;

commit;
