-- Garage v2: Lager 1 -> Garage and Garage -> Ny bil handoffs.
-- regnr remains the permanent vehicle identity. UUIDs below identify episodes/records only.

alter table public.garage_items
  add column if not exists source_journey_period_id uuid,
  add column if not exists source_journey_event_id uuid,
  add column if not exists handed_off_nybil_id uuid,
  add column if not exists handed_off_at timestamptz;

alter table public.nybil_inventering
  add column if not exists source_garage_item_id uuid;

alter table public.garage_items
  drop constraint if exists garage_items_source_journey_period_id_fkey,
  add constraint garage_items_source_journey_period_id_fkey
    foreign key (source_journey_period_id)
    references public.vehicle_journey_periods(period_id)
    on delete restrict;

alter table public.garage_items
  drop constraint if exists garage_items_source_journey_event_id_fkey,
  add constraint garage_items_source_journey_event_id_fkey
    foreign key (source_journey_event_id)
    references public.vehicle_journey_events(event_id)
    on delete restrict;

alter table public.garage_items
  drop constraint if exists garage_items_handed_off_nybil_id_fkey,
  add constraint garage_items_handed_off_nybil_id_fkey
    foreign key (handed_off_nybil_id)
    references public.nybil_inventering(id)
    on delete restrict;

alter table public.nybil_inventering
  drop constraint if exists nybil_inventering_source_garage_item_id_fkey,
  add constraint nybil_inventering_source_garage_item_id_fkey
    foreign key (source_garage_item_id)
    references public.garage_items(garage_item_id)
    on delete restrict;

alter table public.garage_items
  drop constraint if exists garage_items_source_kind_check;

alter table public.garage_items
  add constraint garage_items_source_kind_check
  check (source_kind = any (array['MANUELL'::text, 'PLANERING'::text, 'SALU'::text, 'LAGER1'::text]));

alter table public.garage_items
  drop constraint if exists garage_items_source_consistency_check;

alter table public.garage_items
  add constraint garage_items_source_consistency_check
  check (
    (
      source_kind = 'MANUELL'
      and source_planning_cell_id is null
      and source_planning_unit_no is null
      and source_salu_flag_id is null
      and source_journey_period_id is null
      and source_journey_event_id is null
    )
    or (
      source_kind = 'PLANERING'
      and source_planning_cell_id is not null
      and source_planning_unit_no is not null
      and source_salu_flag_id is null
      and source_journey_period_id is null
      and source_journey_event_id is null
    )
    or (
      source_kind = 'SALU'
      and source_planning_cell_id is null
      and source_planning_unit_no is null
      and source_salu_flag_id is not null
      and source_journey_period_id is null
      and source_journey_event_id is null
    )
    or (
      source_kind = 'LAGER1'
      and regnr is not null
      and source_planning_cell_id is null
      and source_planning_unit_no is null
      and source_salu_flag_id is null
      and source_journey_period_id is not null
    )
  );

create unique index if not exists garage_items_lager1_source_uidx
  on public.garage_items(source_journey_period_id)
  where source_kind = 'LAGER1';

create unique index if not exists garage_items_handoff_nybil_uidx
  on public.garage_items(handed_off_nybil_id)
  where handed_off_nybil_id is not null;

create unique index if not exists nybil_inventering_source_garage_uidx
  on public.nybil_inventering(source_garage_item_id)
  where source_garage_item_id is not null;

create or replace function public.sync_nybil_garage_handoff()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_item public.garage_items%rowtype;
begin
  if new.source_garage_item_id is null then
    return new;
  end if;

  select *
    into v_item
    from public.garage_items
   where garage_item_id = new.source_garage_item_id
   for update;

  if not found then
    raise exception 'Garage item % does not exist', new.source_garage_item_id;
  end if;

  if v_item.garage_direction <> 'IN' then
    raise exception 'Garage item % is not UTVECKLA / IN', new.source_garage_item_id;
  end if;

  if v_item.regnr is null or upper(regexp_replace(v_item.regnr, '\s+', '', 'g')) <> upper(regexp_replace(new.regnr, '\s+', '', 'g')) then
    raise exception 'Garage/Nybil regnr mismatch for Garage item %', new.source_garage_item_id;
  end if;

  if v_item.handed_off_nybil_id is not null and v_item.handed_off_nybil_id <> new.id then
    raise exception 'Garage item % is already handed off to Nybil %', new.source_garage_item_id, v_item.handed_off_nybil_id;
  end if;

  update public.garage_items
     set handed_off_nybil_id = new.id,
         handed_off_at = coalesce(handed_off_at, now()),
         updated_at = now()
   where garage_item_id = new.source_garage_item_id;

  return new;
end;
$$;

revoke all on function public.sync_nybil_garage_handoff() from public, anon, authenticated;

drop trigger if exists nybil_garage_handoff_sync on public.nybil_inventering;
create trigger nybil_garage_handoff_sync
after insert on public.nybil_inventering
for each row
when (new.source_garage_item_id is not null)
execute function public.sync_nybil_garage_handoff();

comment on column public.garage_items.source_journey_period_id is
  'Lager 1 period that was active when BK created this Garage disposition. Does not move or rewrite Lager 1.';
comment on column public.garage_items.source_journey_event_id is
  'Optional exact Lager 1 source event for the Garage disposition.';
comment on column public.nybil_inventering.source_garage_item_id is
  'Garage disposition that handed the vehicle to the authoritative Ny bil control.';
