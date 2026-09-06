begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- H: Planering source fact -> Garage verified complement/change -> Nybil receiving image.
-- Future-only. No historical rows are rewritten or backfilled.
alter table public.garage_items
  add column if not exists returadress text;

comment on column public.garage_items.returadress is
  'Garage current return/SALU address. Separate from saluort. May be completed or corrected in Garage and is preserved as the source image handed to Nybil.';

-- Minimal append-only field audit for the H-owned Garage complements.
create table if not exists public.garage_information_events (
  event_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  field_name text not null check (field_name in ('regnr','returadress','planned_delivery_date','daily_rate')),
  old_value jsonb,
  new_value jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  source_kind text not null,
  source_provenance jsonb not null default '{}'::jsonb
);

comment on table public.garage_information_events is
  'Append-only future-only audit of explicit Garage information complements for H. No historical backfill.';

alter table public.garage_information_events enable row level security;
revoke all on public.garage_information_events from public, anon, authenticated;
grant select on public.garage_information_events to service_role;

create or replace function public.guard_garage_information_events_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Garage information audit is append-only';
end;
$$;

create or replace function public.audit_garage_information_changes_h_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provenance jsonb;
begin
  -- Planering -> Garage default propagation is source/default propagation, not a Garage operator complement.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.updated_by is null then
    raise exception 'Garage information change requires actor provenance';
  end if;

  v_provenance := jsonb_strip_nulls(jsonb_build_object(
    'source_kind', new.source_kind,
    'source_planning_cell_id', new.source_planning_cell_id,
    'source_planning_unit_no', new.source_planning_unit_no,
    'source_salu_flag_id', new.source_salu_flag_id,
    'source_journey_period_id', new.source_journey_period_id,
    'source_journey_event_id', new.source_journey_event_id,
    'source_legacy_entry_id', new.source_legacy_entry_id
  ));

  if new.regnr is distinct from old.regnr then
    insert into public.garage_information_events(garage_item_id,field_name,old_value,new_value,changed_at,changed_by,source_kind,source_provenance)
    values(new.garage_item_id,'regnr',to_jsonb(old.regnr),to_jsonb(new.regnr),new.updated_at,new.updated_by,new.source_kind,v_provenance);
  end if;
  if new.returadress is distinct from old.returadress then
    insert into public.garage_information_events(garage_item_id,field_name,old_value,new_value,changed_at,changed_by,source_kind,source_provenance)
    values(new.garage_item_id,'returadress',to_jsonb(old.returadress),to_jsonb(new.returadress),new.updated_at,new.updated_by,new.source_kind,v_provenance);
  end if;
  if new.planned_delivery_date is distinct from old.planned_delivery_date then
    insert into public.garage_information_events(garage_item_id,field_name,old_value,new_value,changed_at,changed_by,source_kind,source_provenance)
    values(new.garage_item_id,'planned_delivery_date',to_jsonb(old.planned_delivery_date),to_jsonb(new.planned_delivery_date),new.updated_at,new.updated_by,new.source_kind,v_provenance);
  end if;
  if new.daily_rate is distinct from old.daily_rate then
    insert into public.garage_information_events(garage_item_id,field_name,old_value,new_value,changed_at,changed_by,source_kind,source_provenance)
    values(new.garage_item_id,'daily_rate',to_jsonb(old.daily_rate),to_jsonb(new.daily_rate),new.updated_at,new.updated_by,new.source_kind,v_provenance);
  end if;

  return new;
end;
$$;

drop trigger if exists garage_information_events_append_only on public.garage_information_events;
create trigger garage_information_events_append_only
before update or delete on public.garage_information_events
for each row execute function public.guard_garage_information_events_append_only();

drop trigger if exists garage_items_information_audit_h_v1 on public.garage_items;
create trigger garage_items_information_audit_h_v1
after update of regnr, returadress, planned_delivery_date, daily_rate on public.garage_items
for each row execute function public.audit_garage_information_changes_h_v1();

-- Garage daily_rate is vehicle-specific current information.
-- Planering may still push model defaults into blank Garage rows through
-- propagate_planning_model_defaults_to_blank_garage_rows(), but a Garage edit must never
-- establish a Planering model default or fan out daily_rate to sibling Garage rows.
create or replace function public.apply_first_garage_model_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_model_code text;
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

  select pvm.holding_period_months
    into v_existing_holding
  from public.planning_vehicle_models pvm
  where pvm.model_code = v_model_code
  for update;

  -- Holding-period behaviour is outside H and remains unchanged.
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

-- Daily-rate Garage edits must not even invoke the Planning-default trigger.
drop trigger if exists garage_items_first_model_defaults on public.garage_items;
create trigger garage_items_first_model_defaults
after update of holding_period_months on public.garage_items
for each row execute function public.apply_first_garage_model_defaults();

-- Future Planering-origin Garage rows represent cars already ordered, called off and confirmed.
-- Do not fabricate an individual calloff date. Historical calloff_at values are untouched.
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
  v_materialized_count integer := 0;
  v_status public.planning_period_status%rowtype;
begin
  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Period must be YYYY-MM' using errcode='22023'; end if;
  if p_actor is null then raise exception 'Actor is required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext('planning-finalize:' || p_period));

  with desired as (
    select c.planning_cell_id,c.period_code,c.model,c.model_code,c.station,c.note,g.unit_no,m.daily_rate,m.holding_period_months
    from public.fleet_planning_cells c
    cross join lateral generate_series(1,greatest(c.ordered_count,0)) as g(unit_no)
    left join public.planning_vehicle_models m on m.model_code=c.model_code
    where c.period_code=p_period and c.ordered_count>0
  ), inserted as (
    insert into public.garage_items(
      planning_period,model,garage_direction,planning_reason,planned_station,daily_rate,holding_period_months,
      confirmation_status,transport_status,source_kind,source_planning_cell_id,source_planning_unit_no,note,
      created_at,updated_at,created_by,updated_by
    )
    select d.period_code,d.model,'IN','ANNAT',d.station,d.daily_rate,d.holding_period_months,
      'BEKRAFTAD','EJ_BOKAD','PLANERING',d.planning_cell_id,d.unit_no,d.note,
      v_now,v_now,p_actor,p_actor
    from desired d
    where not exists (
      select 1 from public.garage_items gi
      where gi.source_kind='PLANERING' and gi.voided_at is null
        and gi.source_planning_cell_id=d.planning_cell_id and gi.source_planning_unit_no=d.unit_no
    )
    on conflict (source_planning_cell_id,source_planning_unit_no)
      where source_kind='PLANERING' and voided_at is null do nothing
    returning garage_item_id
  ), direction_events as (
    insert into public.garage_direction_events(garage_item_id,from_direction,to_direction,reason,changed_at,changed_by)
    select i.garage_item_id,null,'IN','Planering markerad KLAR',v_now,p_actor from inserted i
    returning garage_direction_event_id
  )
  select count(*)::integer into v_materialized_count from inserted;

  insert into public.planning_period_status(period_code,status,ready_at,ready_by,updated_at,updated_by)
  values(p_period,'KLAR',v_now,p_actor,v_now,p_actor)
  on conflict(period_code) do update
  set status='KLAR',ready_at=excluded.ready_at,ready_by=excluded.ready_by,updated_at=excluded.updated_at,updated_by=excluded.updated_by
  returning * into v_status;

  return jsonb_build_object('data',to_jsonb(v_status),'materialized_count',v_materialized_count);
end;
$$;

-- Keep first Nybil handoff fail-closed for the new Garage source field too.
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
       or new.returadress is distinct from old.returadress
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

revoke all on function public.guard_garage_information_events_append_only() from public, anon, authenticated;
revoke all on function public.audit_garage_information_changes_h_v1() from public, anon, authenticated;
revoke all on function public.apply_first_garage_model_defaults() from public, anon, authenticated;
revoke all on function public.finalize_planning_period_to_garage(text,uuid) from public, anon, authenticated;
revoke all on function public.guard_garage_item_nybil_handoff_freeze() from public, anon, authenticated;
grant execute on function public.finalize_planning_period_to_garage(text,uuid) to service_role;

commit;