create or replace function public.enforce_planning_materialization_floor()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_active_materialized integer;
begin
  if new.ordered_count >= old.ordered_count then
    return new;
  end if;

  select count(*)::integer
    into v_active_materialized
  from public.garage_items gi
  where gi.source_kind = 'PLANERING'
    and gi.voided_at is null
    and gi.source_planning_cell_id = old.planning_cell_id;

  if new.ordered_count < v_active_materialized then
    raise exception 'BESTALLT cannot be lower than active materialized Garage units: requested %, active %', new.ordered_count, v_active_materialized
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists fleet_planning_materialization_floor on public.fleet_planning_cells;

create trigger fleet_planning_materialization_floor
before update of ordered_count on public.fleet_planning_cells
for each row
when (new.ordered_count is distinct from old.ordered_count)
execute function public.enforce_planning_materialization_floor();

comment on function public.enforce_planning_materialization_floor() is
  'Prevents BESTALLT from being reduced below the number of active Garage items already materialized from the planning cell.';
