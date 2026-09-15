#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 -X)
MIGRATION="migrations/20260915133000_salu_v2_step1_planning_garage_handoff.sql"

"${PSQL[@]}" <<'SQL'
drop schema if exists public cascade;
create schema public;
create extension if not exists pgcrypto;

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table public.salu_flags (
  flag_id uuid primary key default gen_random_uuid(),
  regnr text not null,
  cycle_saludatum date not null,
  current_saludatum date not null,
  status text not null default 'NY',
  escalation_status text not null default 'NORMAL',
  owner_function text not null default 'BILKONTROLL',
  created_at timestamptz not null default now(),
  created_by uuid,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  closure_outcome text,
  closure_comment text
);

create table public.vehicles (
  regnr text primary key,
  brand text,
  model text
);

create table public.garage_items (
  garage_item_id uuid primary key default gen_random_uuid(),
  planning_period text,
  model text not null,
  garage_direction text,
  planning_reason text not null default 'ANNAT',
  regnr text,
  source_regnr text,
  source_kind text not null default 'MANUELL',
  source_planning_cell_id uuid,
  source_planning_unit_no integer,
  source_salu_flag_id uuid,
  source_journey_period_id uuid,
  source_journey_event_id uuid,
  confirmation_status text not null default 'PLANERAD',
  transport_status text not null default 'EJ_BOKAD',
  note text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- Reproduce the current-main Garage source contract before applying Step 1.
alter table public.garage_items
  add constraint garage_items_source_kind_check
  check (source_kind = any (array['MANUELL'::text,'PLANERING'::text,'SALU'::text,'LAGER1'::text]));

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

alter table public.garage_items
  add constraint garage_items_salu_source_direction_ut_chk
  check (
    not (source_kind = 'SALU' and source_salu_flag_id is not null)
    or garage_direction is not distinct from 'UT'
  );

create unique index garage_items_salu_source_uidx
  on public.garage_items(source_salu_flag_id)
  where source_kind = 'SALU' and voided_at is null;

-- Representative current-main rows must remain valid after Step 1 expands the source contract.
insert into public.garage_items(model,garage_direction,planning_reason,regnr,source_kind)
values ('Manual','IN','ANNAT','MAN11A','MANUELL');

insert into public.garage_items(model,garage_direction,planning_reason,regnr,source_kind,source_planning_cell_id,source_planning_unit_no)
values ('Planning','IN','ANNAT','PLA22B','PLANERING','33333333-3333-4333-8333-333333333333',1);

insert into public.garage_items(model,garage_direction,planning_reason,regnr,source_kind,source_salu_flag_id)
values ('Historical SALU','UT','SALU','SAL33C','SALU','44444444-4444-4444-8444-444444444444');

insert into public.garage_items(model,garage_direction,planning_reason,regnr,source_kind,source_journey_period_id)
values ('Lager 1','IN','ANNAT','LAG44D','LAGER1','55555555-5555-4555-8555-555555555555');

create table public.handoff_definitions (
  handoff_code text not null,
  handoff_version integer not null,
  routine_code text not null,
  routine_version integer not null,
  title text not null,
  description text,
  from_function text not null,
  to_function text not null,
  verification_mode text not null,
  blocking boolean not null,
  active boolean not null,
  primary key (handoff_code, handoff_version)
);

create table public.handoffs (
  handoff_id uuid primary key default gen_random_uuid(),
  handoff_code text not null,
  handoff_version integer not null default 1,
  regnr text not null,
  source_system text not null,
  source_entity text,
  source_record_id text not null,
  source_event_key text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'REQUESTED',
  created_at timestamptz not null default now(),
  unique (handoff_code, handoff_version, source_system, source_record_id)
);

create or replace function public.ensure_handoff_from_source(
  p_handoff_code text,
  p_regnr text,
  p_source_system text,
  p_source_entity text,
  p_source_record_id text,
  p_source_event_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v public.handoffs%rowtype;
begin
  insert into public.handoffs(handoff_code,handoff_version,regnr,source_system,source_entity,source_record_id,source_event_key,metadata)
  values(p_handoff_code,1,p_regnr,p_source_system,p_source_entity,p_source_record_id,p_source_event_key,coalesce(p_metadata,'{}'::jsonb))
  on conflict (handoff_code,handoff_version,source_system,source_record_id) do nothing
  returning * into v;

  if not found then
    select * into v from public.handoffs
    where handoff_code=p_handoff_code and handoff_version=1
      and source_system=p_source_system and source_record_id=p_source_record_id;
  end if;

  return to_jsonb(v);
end;
$$;

create or replace function public.transition_handoff(
  p_handoff_id uuid,
  p_to_status text,
  p_reason text,
  p_evidence_refs jsonb,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_source text
)
returns jsonb
language plpgsql
as $$
declare v public.handoffs%rowtype;
begin
  update public.handoffs set status=p_to_status where handoff_id=p_handoff_id returning * into v;
  return to_jsonb(v);
end;
$$;
SQL

"${PSQL[@]}" -f "$MIGRATION"

"${PSQL[@]}" <<'SQL'
-- Existing source kinds survive the Step 1 constraint replacement unchanged.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.garage_items
  where source_kind in ('MANUELL','PLANERING','SALU','LAGER1');
  if v_count <> 4 then raise exception 'current-main Garage source rows were not preserved: %', v_count; end if;

  if not exists (
    select 1 from public.garage_items
    where source_kind='SALU' and garage_direction='UT' and source_salu_flag_id='44444444-4444-4444-8444-444444444444'
  ) then
    raise exception 'historical terminal SALU -> Garage UT row changed';
  end if;
end;
$$;

-- The independent current-main SALU => UT constraint must still reject non-UT legacy SALU rows.
do $$
begin
  begin
    insert into public.garage_items(model,garage_direction,planning_reason,regnr,source_kind,source_salu_flag_id)
    values ('Invalid legacy SALU','IN','SALU','BAD55E','SALU','66666666-6666-4666-8666-666666666666');
    raise exception 'legacy SALU direction lock unexpectedly accepted IN';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into public.vehicles(regnr,brand,model) values ('ABC12D','Mercedes-Benz','C 300 e');

insert into public.salu_flags(
  flag_id,regnr,cycle_saludatum,current_saludatum,status,escalation_status,owner_function,created_by
) values (
  '11111111-1111-4111-8111-111111111111',
  'ABC12D',
  date '2026-10-15',
  date '2026-10-15',
  'NY',
  'NORMAL',
  'BILKONTROLL',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

select public.plan_salu_for_garage_v2(
  '11111111-1111-4111-8111-111111111111',
  'QUICK',
  null,
  null,
  null,
  'EJ_BESLUTAD',
  null,
  null,
  null,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

-- Retry must replay the exact same fact and must not create duplicate plan/Garage/handoff rows.
select public.plan_salu_for_garage_v2(
  '11111111-1111-4111-8111-111111111111',
  'QUICK',
  null,
  null,
  null,
  'EJ_BESLUTAD',
  null,
  null,
  null,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

do $$
declare
  v_plan_count integer;
  v_garage_count integer;
  v_handoff_count integer;
  v_created_events integer;
  v_verified_events integer;
  v_status text;
  v_outcome text;
  v_direction text;
  v_source_kind text;
  v_plan_date date;
begin
  select count(*) into v_plan_count from public.salu_plans;
  if v_plan_count <> 1 then raise exception 'expected 1 SALU plan, got %', v_plan_count; end if;

  select count(*), max(garage_direction), max(source_kind)
    into v_garage_count, v_direction, v_source_kind
  from public.garage_items
  where source_salu_flag_id='11111111-1111-4111-8111-111111111111';
  if v_garage_count <> 1 then raise exception 'expected 1 planned SALU Garage item, got %', v_garage_count; end if;
  if v_direction is not null then raise exception 'planned SALU must not assert Garage direction, got %', v_direction; end if;
  if v_source_kind <> 'SALU_PLANERING' then raise exception 'wrong Garage source kind: %', v_source_kind; end if;

  select count(*) into v_handoff_count from public.handoffs where handoff_code='SALU_TO_GARAGE_PLANNING';
  if v_handoff_count <> 1 then raise exception 'expected 1 handoff, got %', v_handoff_count; end if;

  select count(*) filter (where event_type='SALU_PLAN_CREATED'),
         count(*) filter (where event_type='SALU_GARAGE_HANDOFF_VERIFIED')
    into v_created_events, v_verified_events
  from public.salu_plan_events;
  if v_created_events <> 1 or v_verified_events <> 1 then
    raise exception 'unexpected SALU plan event chain: created %, verified %', v_created_events, v_verified_events;
  end if;

  select status, closure_outcome into v_status, v_outcome
  from public.salu_flags where flag_id='11111111-1111-4111-8111-111111111111';
  if v_status <> 'NY' then raise exception 'SALU flag became terminal: %', v_status; end if;
  if v_outcome is not null then raise exception 'PLANERAD SALU fabricated closure outcome: %', v_outcome; end if;

  select planned_saludatum into v_plan_date
  from public.salu_plans where flag_id='11111111-1111-4111-8111-111111111111';
  if v_plan_date <> date '2026-10-15' then raise exception 'QUICK did not preserve current Saludatum: %', v_plan_date; end if;
end;
$$;

-- Individual path stores explicit planning supplements without touching the first historical cycle.
insert into public.vehicles(regnr,brand,model) values ('XYZ98Z','Volkswagen','ID.7');
insert into public.salu_flags(
  flag_id,regnr,cycle_saludatum,current_saludatum,status,escalation_status,owner_function,created_by
) values (
  '22222222-2222-4222-8222-222222222222',
  'XYZ98Z',
  date '2026-11-01',
  date '2026-11-01',
  'HANDLÄGGS',
  'NORMAL',
  'BILKONTROLL',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

select public.plan_salu_for_garage_v2(
  '22222222-2222-4222-8222-222222222222',
  'INDIVIDUAL',
  date '2026-11-08',
  date '2026-11-12',
  'Malmö',
  'TRANSPORT',
  'Verkstad Syd',
  date '2026-11-04',
  'Planera transport efter sista hyra',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

do $$
declare v public.salu_plans%rowtype; v_status text; v_direction text;
begin
  select * into v from public.salu_plans where flag_id='22222222-2222-4222-8222-222222222222';
  if v.planning_mode <> 'INDIVIDUAL' or v.planned_saludatum <> date '2026-11-08'
     or v.proposed_end_date <> date '2026-11-12' or v.salu_destination <> 'Malmö'
     or v.transport_mode <> 'TRANSPORT' or v.repair_destination <> 'Verkstad Syd'
     or v.transport_book_by <> date '2026-11-04' then
    raise exception 'individual planning facts were not preserved';
  end if;
  select status into v_status from public.salu_flags where flag_id=v.flag_id;
  if v_status <> 'HANDLÄGGS' then raise exception 'individual planning rewrote SALU status: %', v_status; end if;
  select garage_direction into v_direction from public.garage_items where source_kind='SALU_PLANERING' and source_salu_flag_id=v.flag_id;
  if v_direction is not null then raise exception 'individual planning fabricated physical Garage direction: %', v_direction; end if;
end;
$$;

select 'SALU V2 Step 1 PostgreSQL acceptance PASS' as result;
SQL
