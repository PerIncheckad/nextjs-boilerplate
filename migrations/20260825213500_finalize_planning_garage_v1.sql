begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

comment on column public.fleet_planning_cells.period_code is
  'Planning month in YYYY-MM format for new planning writes. Historical values remain readable.';

alter table public.garage_items
  add column if not exists source_kind text not null default 'MANUELL',
  add column if not exists source_planning_cell_id uuid references public.fleet_planning_cells(planning_cell_id) on delete restrict,
  add column if not exists source_planning_unit_no integer,
  add column if not exists source_salu_flag_id uuid references public.salu_flags(flag_id) on delete restrict;

update public.garage_items
set source_kind = 'MANUELL'
where source_kind is null;

alter table public.garage_items
  drop constraint if exists garage_items_source_kind_check,
  add constraint garage_items_source_kind_check
    check (source_kind in ('MANUELL','PLANERING','SALU')),
  drop constraint if exists garage_items_source_planning_unit_no_check,
  add constraint garage_items_source_planning_unit_no_check
    check (source_planning_unit_no is null or source_planning_unit_no > 0),
  drop constraint if exists garage_items_source_consistency_check,
  add constraint garage_items_source_consistency_check check (
    (source_kind = 'MANUELL' and source_planning_cell_id is null and source_planning_unit_no is null and source_salu_flag_id is null)
    or
    (source_kind = 'PLANERING' and source_planning_cell_id is not null and source_planning_unit_no is not null and source_salu_flag_id is null)
    or
    (source_kind = 'SALU' and source_planning_cell_id is null and source_planning_unit_no is null and source_salu_flag_id is not null)
  );

create unique index if not exists garage_items_planning_source_uidx
  on public.garage_items(source_planning_cell_id, source_planning_unit_no)
  where source_kind = 'PLANERING';

create unique index if not exists garage_items_salu_source_uidx
  on public.garage_items(source_salu_flag_id)
  where source_kind = 'SALU';

alter table public.garage_items
  drop constraint if exists garage_items_planning_reason_check,
  add constraint garage_items_planning_reason_check
    check (planning_reason in ('BEHOV','UTOK','MINSKNING','SALU','SALU_RETUR','ANNAT'));

do $$
begin
  if exists (select 1 from public.garage_items where transport_status = 'ANKOMMEN') then
    raise exception 'Cannot remove manual Garage ANKOMMEN while rows still use that value';
  end if;
end;
$$;

alter table public.garage_items
  drop constraint if exists garage_items_transport_status_check,
  add constraint garage_items_transport_status_check
    check (transport_status in ('EJ_BOKAD','TRANSPORTBOKAD','PA_VAG'));

comment on column public.garage_items.source_kind is
  'Origin of the Garage object: MANUELL, PLANERING or SALU. Origin is traceability only and does not rewrite Layer 1.';
comment on column public.garage_items.source_planning_cell_id is
  'Planning cell used when a BESTÄLLT quantity is materialized into individual Garage objects.';
comment on column public.garage_items.source_planning_unit_no is
  'Stable 1-based unit number inside one Planning source cell, used to prevent duplicate materialization.';
comment on column public.garage_items.source_salu_flag_id is
  'Exact SALU cycle source. Unique per Garage import so one SALU cycle cannot be imported twice.';
comment on column public.garage_items.transport_status is
  'Garage transport intent only. Actual ANKOMST is Layer 1 and is not manually set in Garage.';

create or replace function public.replan_garage_station(
  p_garage_item_id uuid,
  p_to_station text,
  p_reason text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.garage_items%rowtype;
  v_from text;
begin
  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage item not found' using errcode = 'P0002';
  end if;

  if p_to_station is not null and not exists (
    select 1 from public.planning_stations s
    where s.station_code = p_to_station and s.is_active
  ) then
    raise exception 'Inactive or unknown planning station' using errcode = '22023';
  end if;

  v_from := v_item.planned_station;
  if v_from is not distinct from p_to_station then
    return to_jsonb(v_item);
  end if;

  update public.garage_items
  set planned_station = p_to_station,
      updated_at = now(),
      updated_by = p_actor
  where garage_item_id = p_garage_item_id
  returning * into v_item;

  insert into public.garage_station_events(
    garage_item_id, from_station, to_station, reason, changed_at, changed_by
  ) values (
    p_garage_item_id, v_from, p_to_station, nullif(trim(coalesce(p_reason,'')),''), now(), p_actor
  );

  return to_jsonb(v_item);
end;
$$;

create or replace function public.change_garage_direction(
  p_garage_item_id uuid,
  p_to_direction text,
  p_reason text,
  p_actor uuid
)
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

  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage item not found' using errcode = 'P0002';
  end if;

  v_from := v_item.garage_direction;
  if v_from is not distinct from v_to then
    return to_jsonb(v_item);
  end if;

  update public.garage_items
  set garage_direction = v_to,
      updated_at = now(),
      updated_by = p_actor
  where garage_item_id = p_garage_item_id
  returning * into v_item;

  insert into public.garage_direction_events(
    garage_item_id, from_direction, to_direction, reason, changed_at, changed_by
  ) values (
    p_garage_item_id, v_from, v_to, nullif(trim(coalesce(p_reason,'')),''), now(), p_actor
  );

  return to_jsonb(v_item);
end;
$$;

revoke all on function public.replan_garage_station(uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.change_garage_direction(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.replan_garage_station(uuid,text,text,uuid) to service_role;
grant execute on function public.change_garage_direction(uuid,text,text,uuid) to service_role;

commit;
