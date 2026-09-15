begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- SALU V2 / Step 1
-- Future-only planning decision and exact Garage work-responsibility handoff.
-- PLANERAD SALU is not a closure, sale, physical Garage arrival or terminal EXIT.
-- Existing historical STÄNGD + SÄLJAS -> Garage UT semantics remain unchanged.

create table public.salu_plans (
  plan_id uuid primary key default gen_random_uuid(),
  flag_id uuid not null unique references public.salu_flags(flag_id) on delete restrict,
  regnr text not null,
  planning_mode text not null check (planning_mode in ('QUICK','INDIVIDUAL')),
  source_saludatum date not null,
  planned_saludatum date not null,
  proposed_end_date date,
  salu_destination text,
  transport_mode text not null default 'EJ_BESLUTAD'
    check (transport_mode in ('EJ_BESLUTAD','TRANSPORT','EGEN_KORNING')),
  repair_destination text,
  transport_book_by date,
  note text,
  status text not null default 'PLANERAD' check (status = 'PLANERAD'),
  planned_at timestamptz not null default now(),
  planned_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  check (planned_saludatum >= source_saludatum or planning_mode = 'INDIVIDUAL')
);

comment on table public.salu_plans is
  'SALU-owned future planning decision. PLANERAD is non-terminal and does not assert sale, Garage location, AVVECKLA or canonical fleet EXIT.';

create table public.salu_plan_events (
  event_id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.salu_plans(plan_id) on delete restrict,
  flag_id uuid not null references public.salu_flags(flag_id) on delete restrict,
  regnr text not null,
  event_type text not null check (event_type in ('SALU_PLAN_CREATED','SALU_GARAGE_HANDOFF_VERIFIED')),
  event_key text not null unique,
  occurred_at timestamptz not null default now(),
  actor_id uuid not null,
  payload jsonb not null default '{}'::jsonb
);

create or replace function public.reject_salu_plan_event_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'salu_plan_events is append-only' using errcode = 'P0001';
end;
$$;

create trigger salu_plan_events_append_only
before update or delete on public.salu_plan_events
for each row execute function public.reject_salu_plan_event_mutation_v1();

alter table public.salu_plans enable row level security;
alter table public.salu_plan_events enable row level security;
revoke all on public.salu_plans from public, anon, authenticated;
revoke all on public.salu_plan_events from public, anon, authenticated;
grant select, insert on public.salu_plans to service_role;
grant select, insert on public.salu_plan_events to service_role;

-- A planned SALU work object must not reuse the legacy source_kind='SALU'
-- invariant, because that source kind is permanently tied to AVVECKLA / UT.
alter table public.garage_items
  drop constraint if exists garage_items_source_kind_check;
alter table public.garage_items
  add constraint garage_items_source_kind_check
  check (source_kind = any (array['MANUELL'::text,'PLANERING'::text,'SALU'::text,'SALU_PLANERING'::text,'LAGER1'::text]));

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
      source_kind in ('SALU','SALU_PLANERING')
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

create unique index garage_items_salu_planning_source_uidx
  on public.garage_items(source_salu_flag_id)
  where source_kind = 'SALU_PLANERING' and voided_at is null;

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
  'SALU_TO_GARAGE_PLANNING',
  1,
  'SALU_CYCLE',
  1,
  'SALU planering till Garage arbetsansvar',
  'Atomiskt handslag från PLANERAD SALU till Garage arbetsansvar. Skapar inte fysisk Garage-status, AVVECKLA eller terminal EXIT.',
  'BILKONTROLL',
  'GARAGE',
  'SYSTEM',
  true,
  true
)
on conflict (handoff_code, handoff_version) do nothing;

create or replace function public.plan_salu_for_garage_v2(
  p_flag_id uuid,
  p_planning_mode text,
  p_planned_saludatum date,
  p_proposed_end_date date,
  p_salu_destination text,
  p_transport_mode text,
  p_repair_destination text,
  p_transport_book_by date,
  p_note text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_flag public.salu_flags%rowtype;
  v_existing_plan public.salu_plans%rowtype;
  v_plan public.salu_plans%rowtype;
  v_item public.garage_items%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_model text;
  v_mode text := upper(pg_catalog.btrim(pg_catalog.coalesce(p_planning_mode, '')));
  v_transport text := upper(pg_catalog.btrim(pg_catalog.coalesce(p_transport_mode, 'EJ_BESLUTAD')));
  v_planned_saludatum date;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_handoff jsonb;
  v_handoff_id uuid;
begin
  if p_flag_id is null then
    raise exception 'SALU flag krävs' using errcode = '22023';
  end if;
  if p_actor_id is null then
    raise exception 'Verifierad aktör krävs' using errcode = '22023';
  end if;
  if v_mode not in ('QUICK','INDIVIDUAL') then
    raise exception 'Ogiltigt planeringsläge' using errcode = '22023';
  end if;
  if v_transport not in ('EJ_BESLUTAD','TRANSPORT','EGEN_KORNING') then
    raise exception 'Ogiltigt transportsätt' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('salu-plan-garage:' || p_flag_id::text));

  select * into v_flag
  from public.salu_flags
  where flag_id = p_flag_id
  for update;

  if not found then
    raise exception 'SALU flag finns inte' using errcode = 'P0002';
  end if;
  if v_flag.status = 'STÄNGD' then
    raise exception 'Stängd historisk SALU-cykel kan inte planeras' using errcode = 'P0001';
  end if;

  select * into v_existing_plan
  from public.salu_plans
  where flag_id = p_flag_id;

  if found then
    select * into v_item
    from public.garage_items
    where source_kind = 'SALU_PLANERING'
      and source_salu_flag_id = p_flag_id
      and voided_at is null
    limit 1;

    select h.handoff_id into v_handoff_id
    from public.handoffs h
    where h.handoff_code = 'SALU_TO_GARAGE_PLANNING'
      and h.source_system = 'SALU'
      and h.source_record_id = p_flag_id::text
    order by h.created_at desc
    limit 1;

    return pg_catalog.jsonb_build_object(
      'plan', pg_catalog.to_jsonb(v_existing_plan),
      'garageItemId', v_item.garage_item_id,
      'handoffId', v_handoff_id,
      'idempotentReplay', true,
      'terminalClosure', false,
      'avvecklaStarted', false
    );
  end if;

  v_planned_saludatum := pg_catalog.coalesce(p_planned_saludatum, v_flag.current_saludatum);
  if v_mode = 'QUICK' then
    v_planned_saludatum := v_flag.current_saludatum;
  end if;
  if v_planned_saludatum is null then
    raise exception 'Aktuellt SALU-datum saknas' using errcode = 'P0001';
  end if;
  if p_proposed_end_date is not null and p_proposed_end_date < v_planned_saludatum then
    raise exception 'Föreslaget slutdatum kan inte ligga före planerat SALU-datum' using errcode = '22023';
  end if;

  insert into public.salu_plans (
    flag_id, regnr, planning_mode, source_saludatum, planned_saludatum,
    proposed_end_date, salu_destination, transport_mode, repair_destination,
    transport_book_by, note, status, planned_at, planned_by, created_at, updated_at, updated_by
  ) values (
    v_flag.flag_id,
    upper(pg_catalog.regexp_replace(v_flag.regnr, '\s+', '', 'g')),
    v_mode,
    v_flag.current_saludatum,
    v_planned_saludatum,
    p_proposed_end_date,
    nullif(pg_catalog.btrim(pg_catalog.coalesce(p_salu_destination, '')), ''),
    v_transport,
    nullif(pg_catalog.btrim(pg_catalog.coalesce(p_repair_destination, '')), ''),
    p_transport_book_by,
    nullif(pg_catalog.btrim(pg_catalog.coalesce(p_note, '')), ''),
    'PLANERAD',
    v_now,
    p_actor_id,
    v_now,
    v_now,
    p_actor_id
  ) returning * into v_plan;

  insert into public.salu_plan_events (
    plan_id, flag_id, regnr, event_type, event_key, occurred_at, actor_id, payload
  ) values (
    v_plan.plan_id,
    v_flag.flag_id,
    v_plan.regnr,
    'SALU_PLAN_CREATED',
    'SALU_PLAN_CREATED:' || v_flag.flag_id::text,
    v_now,
    p_actor_id,
    pg_catalog.jsonb_build_object(
      'planningMode', v_plan.planning_mode,
      'sourceSaludatum', v_plan.source_saludatum,
      'plannedSaludatum', v_plan.planned_saludatum,
      'proposedEndDate', v_plan.proposed_end_date,
      'saluDestination', v_plan.salu_destination,
      'transportMode', v_plan.transport_mode,
      'repairDestination', v_plan.repair_destination,
      'transportBookBy', v_plan.transport_book_by,
      'note', v_plan.note
    )
  );

  select * into v_vehicle
  from public.vehicles
  where upper(pg_catalog.regexp_replace(regnr, '\s+', '', 'g')) = v_plan.regnr
  limit 1;

  v_model := nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', v_vehicle.brand, v_vehicle.model)), '');
  if v_model is null then
    v_model := v_plan.regnr;
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
    confirmation_status,
    transport_status,
    note,
    created_at,
    updated_at,
    created_by,
    updated_by
  ) values (
    pg_catalog.to_char(v_plan.planned_saludatum, 'YYYY-MM'),
    v_model,
    null,
    'SALU',
    v_plan.regnr,
    v_plan.regnr,
    'SALU_PLANERING',
    v_flag.flag_id,
    'PLANERAD',
    'EJ_BOKAD',
    'PLANERAD SALU – arbetsansvar mottaget; fysisk plats oförändrad',
    v_now,
    v_now,
    p_actor_id,
    p_actor_id
  ) returning * into v_item;

  v_handoff := public.ensure_handoff_from_source(
    'SALU_TO_GARAGE_PLANNING',
    v_plan.regnr,
    'SALU',
    'salu_flags',
    v_flag.flag_id::text,
    'SALU_PLAN_CREATED:' || v_flag.flag_id::text,
    pg_catalog.jsonb_build_object(
      'planId', v_plan.plan_id,
      'garageItemId', v_item.garage_item_id,
      'planningMode', v_plan.planning_mode,
      'plannedSaludatum', v_plan.planned_saludatum,
      'physicalLocationChanged', false,
      'terminalClosure', false,
      'avvecklaStarted', false
    )
  );

  v_handoff_id := (v_handoff ->> 'handoff_id')::uuid;

  if (v_handoff ->> 'status') = 'REQUESTED' then
    perform public.transition_handoff(v_handoff_id, 'HANDED_OVER', 'PLANERAD SALU', '[]'::jsonb, p_actor_id, null, 'MANUELL');
    perform public.transition_handoff(v_handoff_id, 'RECEIVED', 'Garage arbetsobjekt skapat', '[]'::jsonb, p_actor_id, null, 'SYSTEM');
    perform public.transition_handoff(v_handoff_id, 'ACCEPTED', 'Garage har mottagit operativt arbetsansvar', '[]'::jsonb, p_actor_id, null, 'SYSTEM');
    perform public.transition_handoff(v_handoff_id, 'COMPLETED', 'Plan och källkoppling etablerade', '[]'::jsonb, p_actor_id, null, 'SYSTEM');
    perform public.transition_handoff(v_handoff_id, 'VERIFIED', 'SALU planering till Garage verifierad atomiskt', '[]'::jsonb, p_actor_id, null, 'SYSTEM');
  end if;

  insert into public.salu_plan_events (
    plan_id, flag_id, regnr, event_type, event_key, occurred_at, actor_id, payload
  ) values (
    v_plan.plan_id,
    v_flag.flag_id,
    v_plan.regnr,
    'SALU_GARAGE_HANDOFF_VERIFIED',
    'SALU_GARAGE_HANDOFF_VERIFIED:' || v_flag.flag_id::text,
    v_now,
    p_actor_id,
    pg_catalog.jsonb_build_object(
      'garageItemId', v_item.garage_item_id,
      'handoffId', v_handoff_id
    )
  );

  return pg_catalog.jsonb_build_object(
    'plan', pg_catalog.to_jsonb(v_plan),
    'garageItemId', v_item.garage_item_id,
    'handoffId', v_handoff_id,
    'idempotentReplay', false,
    'terminalClosure', false,
    'avvecklaStarted', false
  );
end;
$$;

revoke all on function public.reject_salu_plan_event_mutation_v1() from public, anon, authenticated;
revoke all on function public.plan_salu_for_garage_v2(uuid,text,date,date,text,text,text,date,text,uuid)
  from public, anon, authenticated;
grant execute on function public.plan_salu_for_garage_v2(uuid,text,date,date,text,text,text,date,text,uuid)
  to service_role;

comment on function public.plan_salu_for_garage_v2(uuid,text,date,date,text,text,text,date,text,uuid) is
  'SALU V2 Step 1: future-only PLANERAD SALU decision and exact idempotent Garage work-responsibility handoff. Never closes SALU, starts AVVECKLA, changes physical location or creates canonical fleet EXIT.';

commit;
