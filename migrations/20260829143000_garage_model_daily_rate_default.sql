-- Garage daily rate semantics:
-- 1) daily_rate on garage_items remains an individual vehicle value and may diverge per row.
-- 2) planning_vehicle_models.daily_rate is the default for future Planering -> Garage materialization.
-- 3) The first explicit non-null daily_rate entered for a Planering-origin model establishes the
--    model default only when no default exists, and fills only currently blank sibling rows.
--    Existing non-null sibling values are preserved as individual overrides.

create or replace function public.apply_first_garage_model_daily_rate_default()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_model_code text;
  v_existing_default integer;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.source_kind <> 'PLANERING'
     or new.source_planning_cell_id is null
     or new.daily_rate is null
     or new.daily_rate is not distinct from old.daily_rate then
    return new;
  end if;

  select fpc.model_code
    into v_model_code
  from public.fleet_planning_cells fpc
  where fpc.planning_cell_id = new.source_planning_cell_id;

  if v_model_code is null then
    return new;
  end if;

  select pvm.daily_rate
    into v_existing_default
  from public.planning_vehicle_models pvm
  where pvm.model_code = v_model_code
  for update;

  -- A model default already exists: this edit is an individual override only.
  if v_existing_default is not null then
    return new;
  end if;

  update public.planning_vehicle_models
  set daily_rate = round(new.daily_rate)::integer,
      updated_at = clock_timestamp()
  where model_code = v_model_code
    and daily_rate is null;

  -- Fill only blank active Planering-origin Garage rows for the same stable model identity.
  -- Never overwrite an existing vehicle-level daily-rate override.
  update public.garage_items gi
  set daily_rate = new.daily_rate,
      updated_at = clock_timestamp()
  from public.fleet_planning_cells fpc
  where gi.source_kind = 'PLANERING'
    and gi.voided_at is null
    and gi.daily_rate is null
    and gi.source_planning_cell_id = fpc.planning_cell_id
    and fpc.model_code = v_model_code
    and gi.garage_item_id <> new.garage_item_id;

  return new;
end;
$$;

drop trigger if exists garage_items_first_model_daily_rate_default on public.garage_items;
create trigger garage_items_first_model_daily_rate_default
after update of daily_rate on public.garage_items
for each row
execute function public.apply_first_garage_model_daily_rate_default();

revoke all on function public.apply_first_garage_model_daily_rate_default() from public;
revoke all on function public.apply_first_garage_model_daily_rate_default() from anon;
revoke all on function public.apply_first_garage_model_daily_rate_default() from authenticated;