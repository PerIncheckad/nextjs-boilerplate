begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.planning_vehicle_models
  add column if not exists holding_period_months integer;

alter table public.planning_vehicle_models
  drop constraint if exists planning_vehicle_models_holding_period_months_check;

alter table public.planning_vehicle_models
  add constraint planning_vehicle_models_holding_period_months_check
  check (holding_period_months is null or holding_period_months in (4, 6, 9, 12, 18, 24));

-- Model defaults are defaults, not forced equality.
-- Existing non-null Garage values are preserved as possible vehicle-specific overrides.
-- A default only fills currently blank Planering-origin Garage rows for the same stable model_code.
create or replace function public.propagate_planning_model_defaults_to_blank_garage_rows()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.daily_rate is distinct from old.daily_rate and new.daily_rate is not null then
    update public.garage_items gi
    set daily_rate = new.daily_rate,
        updated_at = clock_timestamp()
    from public.fleet_planning_cells fpc
    where gi.source_kind = 'PLANERING'
      and gi.voided_at is null
      and gi.daily_rate is null
      and gi.source_planning_cell_id = fpc.planning_cell_id
      and fpc.model_code = new.model_code;
  end if;

  if new.holding_period_months is distinct from old.holding_period_months and new.holding_period_months is not null then
    update public.garage_items gi
    set holding_period_months = new.holding_period_months,
        updated_at = clock_timestamp()
    from public.fleet_planning_cells fpc
    where gi.source_kind = 'PLANERING'
      and gi.voided_at is null
      and gi.holding_period_months is null
      and gi.source_planning_cell_id = fpc.planning_cell_id
      and fpc.model_code = new.model_code;
  end if;

  return new;
end;
$$;

drop trigger if exists planning_vehicle_models_propagate_defaults on public.planning_vehicle_models;
create trigger planning_vehicle_models_propagate_defaults
after update of daily_rate, holding_period_months on public.planning_vehicle_models
for each row
execute function public.propagate_planning_model_defaults_to_blank_garage_rows();

-- First explicit Garage value may establish a missing model default.
-- It also fills blank siblings directly because the model update occurs inside this trigger and
-- the model propagation trigger deliberately ignores nested trigger depth.
-- Once a model default exists, later edits on one Garage row remain vehicle-specific overrides.
create or replace function public.apply_first_garage_model_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_model_code text;
  v_existing_daily_rate integer;
  v_existing_holding integer;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.source_kind <> 'PLANERING' or new.source_planning_cell_id is null then
    return new;
  end if;

  select fpc.model_code
    into v_model_code
  from public.fleet_planning_cells fpc
  where fpc.planning_cell_id = new.source_planning_cell_id;

  if v_model_code is null then
    return new;
  end if;

  select pvm.daily_rate, pvm.holding_period_months
    into v_existing_daily_rate, v_existing_holding
  from public.planning_vehicle_models pvm
  where pvm.model_code = v_model_code
  for update;

  if new.daily_rate is not null
     and new.daily_rate is distinct from old.daily_rate
     and v_existing_daily_rate is null then
    update public.planning_vehicle_models
    set daily_rate = round(new.daily_rate)::integer,
        updated_at = clock_timestamp()
    where model_code = v_model_code
      and daily_rate is null;

    update public.garage_items gi
    set daily_rate = new.daily_rate,
        updated_at = clock_timestamp()
    from public.fleet_planning_cells fpc
    where gi.source_kind = 'PLANERING'
      and gi.voided_at is null
      and gi.daily_rate is null
      and gi.garage_item_id <> new.garage_item_id
      and gi.source_planning_cell_id = fpc.planning_cell_id
      and fpc.model_code = v_model_code;
  end if;

  if new.holding_period_months is not null
     and new.holding_period_months is distinct from old.holding_period_months
     and v_existing_holding is null then
    update public.planning_vehicle_models
    set holding_period_months = new.holding_period_months,
        updated_at = clock_timestamp()
    where model_code = v_model_code
      and holding_period_months is null;

    update public.garage_items gi
    set holding_period_months = new.holding_period_months,
        updated_at = clock_timestamp()
    from public.fleet_planning_cells fpc
    where gi.source_kind = 'PLANERING'
      and gi.voided_at is null
      and gi.holding_period_months is null
      and gi.garage_item_id <> new.garage_item_id
      and gi.source_planning_cell_id = fpc.planning_cell_id
      and fpc.model_code = v_model_code;
  end if;

  return new;
end;
$$;

drop trigger if exists garage_items_first_model_daily_rate_default on public.garage_items;
drop trigger if exists garage_items_first_model_defaults on public.garage_items;
create trigger garage_items_first_model_defaults
after update of daily_rate, holding_period_months on public.garage_items
for each row
execute function public.apply_first_garage_model_defaults();

-- Keep Planering -> Garaget handoff atomic and include both model defaults.
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
      m.daily_rate,
      m.holding_period_months
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
      holding_period_months,
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
      d.holding_period_months,
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

revoke all on function public.propagate_planning_model_defaults_to_blank_garage_rows() from public, anon, authenticated;
revoke all on function public.apply_first_garage_model_defaults() from public, anon, authenticated;
revoke all on function public.finalize_planning_period_to_garage(text,uuid) from public, anon, authenticated;
grant execute on function public.finalize_planning_period_to_garage(text,uuid) to service_role;

comment on column public.planning_vehicle_models.daily_rate is
  'Model default for daily rate. Individual Garage rows may override it.';
comment on column public.planning_vehicle_models.holding_period_months is
  'Model default holding period in months. Allowed 4/6/9/12/18/24. Individual Garage rows may override it.';

commit;
