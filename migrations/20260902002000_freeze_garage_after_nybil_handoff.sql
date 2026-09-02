begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A Garage object becomes immutable once the exact Nybil handoff has been acknowledged.
-- The first acknowledgement is only allowed from the nested Nybil INSERT trigger path.
create or replace function public.guard_garage_item_nybil_handoff_freeze()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.handed_off_nybil_id is not null and new is distinct from old then
    raise exception 'Garage-objektet är mottaget i Ny bil och är fryst';
  end if;

  if old.handed_off_nybil_id is null and new.handed_off_nybil_id is not null then
    if pg_trigger_depth() <= 1 then
      raise exception 'Ny bil-kvittens får endast sättas av det atomiska Ny bil-handslaget';
    end if;

    if new.handed_off_at is null then
      raise exception 'Ny bil-kvittens kräver handed_off_at';
    end if;

    if new.garage_item_id is distinct from old.garage_item_id
       or new.planning_period is distinct from old.planning_period
       or new.model is distinct from old.model
       or new.planning_reason is distinct from old.planning_reason
       or new.supplier is distinct from old.supplier
       or new.order_reference is distinct from old.order_reference
       or new.regnr is distinct from old.regnr
       or new.vin is distinct from old.vin
       or new.source_regnr is distinct from old.source_regnr
       or new.planned_station is distinct from old.planned_station
       or new.saluort is distinct from old.saluort
       or new.daily_rate is distinct from old.daily_rate
       or new.ordered_at is distinct from old.ordered_at
       or new.calloff_at is distinct from old.calloff_at
       or new.confirmation_status is distinct from old.confirmation_status
       or new.transport_status is distinct from old.transport_status
       or new.planned_delivery_date is distinct from old.planned_delivery_date
       or new.note is distinct from old.note
       or new.created_at is distinct from old.created_at
       or new.created_by is distinct from old.created_by
       or new.updated_by is distinct from old.updated_by
       or new.garage_direction is distinct from old.garage_direction
       or new.source_kind is distinct from old.source_kind
       or new.source_planning_cell_id is distinct from old.source_planning_cell_id
       or new.source_planning_unit_no is distinct from old.source_planning_unit_no
       or new.source_salu_flag_id is distinct from old.source_salu_flag_id
       or new.source_journey_period_id is distinct from old.source_journey_period_id
       or new.source_journey_event_id is distinct from old.source_journey_event_id
       or new.voided_at is distinct from old.voided_at
       or new.voided_by is distinct from old.voided_by
       or new.void_reason is distinct from old.void_reason
       or new.holding_period_months is distinct from old.holding_period_months then
      raise exception 'Ny bil-kvittensen får inte ändra Garage-fakta';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists garage_items_nybil_handoff_freeze on public.garage_items;
create trigger garage_items_nybil_handoff_freeze
before update on public.garage_items
for each row
execute function public.guard_garage_item_nybil_handoff_freeze();

-- Model defaults only belong to cars that are still active in Garage.
create or replace function public.propagate_planning_model_defaults_to_blank_garage_rows()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;

  if new.daily_rate is distinct from old.daily_rate and new.daily_rate is not null then
    update public.garage_items gi
    set daily_rate = new.daily_rate,
        updated_at = clock_timestamp()
    from public.fleet_planning_cells fpc
    where gi.source_kind = 'PLANERING'
      and gi.voided_at is null
      and gi.handed_off_nybil_id is null
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
      and gi.handed_off_nybil_id is null
      and gi.holding_period_months is null
      and gi.source_planning_cell_id = fpc.planning_cell_id
      and fpc.model_code = new.model_code;
  end if;

  return new;
end;
$$;

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
  if pg_trigger_depth() > 1 then return new; end if;
  if new.source_kind <> 'PLANERING'
     or new.source_planning_cell_id is null
     or new.handed_off_nybil_id is not null then
    return new;
  end if;

  select fpc.model_code into v_model_code
  from public.fleet_planning_cells fpc
  where fpc.planning_cell_id = new.source_planning_cell_id;

  if v_model_code is null then return new; end if;

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
    where model_code = v_model_code and daily_rate is null;

    update public.garage_items gi
    set daily_rate = new.daily_rate,
        updated_at = clock_timestamp()
    from public.fleet_planning_cells fpc
    where gi.source_kind = 'PLANERING'
      and gi.voided_at is null
      and gi.handed_off_nybil_id is null
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
    where model_code = v_model_code and holding_period_months is null;

    update public.garage_items gi
    set holding_period_months = new.holding_period_months,
        updated_at = clock_timestamp()
    from public.fleet_planning_cells fpc
    where gi.source_kind = 'PLANERING'
      and gi.voided_at is null
      and gi.handed_off_nybil_id is null
      and gi.holding_period_months is null
      and gi.garage_item_id <> new.garage_item_id
      and gi.source_planning_cell_id = fpc.planning_cell_id
      and fpc.model_code = v_model_code;
  end if;

  return new;
end;
$$;

-- RPC paths also fail explicitly before attempting a frozen-row update.
create or replace function public.change_garage_direction(p_garage_item_id uuid, p_to_direction text, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.garage_items%rowtype;
  v_from text;
  v_to text := upper(trim(coalesce(p_to_direction,'')));
begin
  if v_to not in ('IN','UT') then
    raise exception 'Garage direction must be IN or UT' using errcode = '22023';
  end if;

  select * into v_item from public.garage_items where garage_item_id = p_garage_item_id for update;
  if not found then raise exception 'Garage item not found' using errcode = 'P0002'; end if;
  if v_item.handed_off_nybil_id is not null then raise exception 'Garage-objektet är mottaget i Ny bil och är fryst'; end if;

  v_from := v_item.garage_direction;
  if v_from is not distinct from v_to then return to_jsonb(v_item); end if;

  update public.garage_items set garage_direction = v_to, updated_at = now(), updated_by = p_actor where garage_item_id = p_garage_item_id returning * into v_item;
  insert into public.garage_direction_events(garage_item_id, from_direction, to_direction, reason, changed_at, changed_by)
  values (p_garage_item_id, v_from, v_to, nullif(trim(coalesce(p_reason,'')),''), now(), p_actor);
  return to_jsonb(v_item);
end;
$$;

create or replace function public.replan_garage_station(p_garage_item_id uuid, p_to_station text, p_reason text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.garage_items%rowtype;
  v_from text;
begin
  select * into v_item from public.garage_items where garage_item_id = p_garage_item_id for update;
  if not found then raise exception 'Garage item not found' using errcode = 'P0002'; end if;
  if v_item.handed_off_nybil_id is not null then raise exception 'Garage-objektet är mottaget i Ny bil och är fryst'; end if;

  if p_to_station is not null and not exists (
    select 1 from public.planning_stations s where s.station_code = p_to_station and s.is_active
  ) then
    raise exception 'Inactive or unknown planning station' using errcode = '22023';
  end if;

  v_from := v_item.planned_station;
  if v_from is not distinct from p_to_station then return to_jsonb(v_item); end if;

  update public.garage_items set planned_station = p_to_station, updated_at = now(), updated_by = p_actor where garage_item_id = p_garage_item_id returning * into v_item;
  insert into public.garage_station_events(garage_item_id, from_station, to_station, reason, changed_at, changed_by)
  values (p_garage_item_id, v_from, p_to_station, nullif(trim(coalesce(p_reason,'')),''), now(), p_actor);
  return to_jsonb(v_item);
end;
$$;

revoke all on function public.guard_garage_item_nybil_handoff_freeze() from public, anon, authenticated;
revoke all on function public.propagate_planning_model_defaults_to_blank_garage_rows() from public, anon, authenticated;
revoke all on function public.apply_first_garage_model_defaults() from public, anon, authenticated;
revoke all on function public.change_garage_direction(uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.replan_garage_station(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.change_garage_direction(uuid,text,text,uuid) to service_role;
grant execute on function public.replan_garage_station(uuid,text,text,uuid) to service_role;

commit;
