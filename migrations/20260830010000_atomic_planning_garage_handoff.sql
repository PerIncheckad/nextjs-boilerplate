begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.finalize_planning_period_to_garage(
  p_period text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := now();
  v_calloff_date date := (now() at time zone 'Europe/Stockholm')::date;
  v_materialized_count integer := 0;
  v_status public.planning_period_status%rowtype;
begin
  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Period must be YYYY-MM' using errcode = '22023';
  end if;

  if p_actor is null then
    raise exception 'Actor is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('planning-finalize:' || p_period));

  with desired as (
    select
      c.planning_cell_id,
      c.period_code,
      c.model,
      c.model_code,
      c.station,
      c.note,
      g.unit_no,
      m.daily_rate
    from public.fleet_planning_cells c
    cross join lateral generate_series(1, greatest(c.ordered_count, 0)) as g(unit_no)
    left join public.planning_vehicle_models m on m.model_code = c.model_code
    where c.period_code = p_period
      and c.ordered_count > 0
  ), inserted as (
    insert into public.garage_items(
      planning_period,
      model,
      garage_direction,
      planning_reason,
      planned_station,
      daily_rate,
      calloff_at,
      confirmation_status,
      transport_status,
      source_kind,
      source_planning_cell_id,
      source_planning_unit_no,
      note,
      created_at,
      updated_at,
      created_by,
      updated_by
    )
    select
      d.period_code,
      d.model,
      'IN',
      'ANNAT',
      d.station,
      d.daily_rate,
      v_calloff_date,
      'PLANERAD',
      'EJ_BOKAD',
      'PLANERING',
      d.planning_cell_id,
      d.unit_no,
      d.note,
      v_now,
      v_now,
      p_actor,
      p_actor
    from desired d
    where not exists (
      select 1
      from public.garage_items gi
      where gi.source_kind = 'PLANERING'
        and gi.voided_at is null
        and gi.source_planning_cell_id = d.planning_cell_id
        and gi.source_planning_unit_no = d.unit_no
    )
    on conflict (source_planning_cell_id, source_planning_unit_no)
      where source_kind = 'PLANERING' and voided_at is null
      do nothing
    returning garage_item_id
  ), direction_events as (
    insert into public.garage_direction_events(
      garage_item_id,
      from_direction,
      to_direction,
      reason,
      changed_at,
      changed_by
    )
    select
      i.garage_item_id,
      null,
      'IN',
      'Planering markerad KLAR',
      v_now,
      p_actor
    from inserted i
    returning garage_direction_event_id
  )
  select count(*)::integer into v_materialized_count from inserted;

  insert into public.planning_period_status(
    period_code,
    status,
    ready_at,
    ready_by,
    updated_at,
    updated_by
  ) values (
    p_period,
    'KLAR',
    v_now,
    p_actor,
    v_now,
    p_actor
  )
  on conflict (period_code) do update
  set status = 'KLAR',
      ready_at = excluded.ready_at,
      ready_by = excluded.ready_by,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  returning * into v_status;

  return jsonb_build_object(
    'data', to_jsonb(v_status),
    'materialized_count', v_materialized_count
  );
end;
$$;

revoke all on function public.finalize_planning_period_to_garage(text,uuid) from public, anon, authenticated;
grant execute on function public.finalize_planning_period_to_garage(text,uuid) to service_role;

comment on function public.finalize_planning_period_to_garage(text,uuid) is
  'Atomically materializes missing BESTALLT units into Garage, writes direction audit events, and marks the Planning period KLAR. Any failure rolls back the whole operation.';

commit;
