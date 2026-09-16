#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 -X)

# Build the exact locked SALU V2 Step 1-3 fixture first.
bash scripts/test-salu-v2-step3-postgres.sh

# Add only the pre-existing terminal/fleet contracts Step 4 depends on.
"${PSQL[@]}" <<'SQL'
create table if not exists public.damages (
  id uuid primary key default gen_random_uuid(), regnr text not null, source text,
  damage_date date, damage_type_raw text, note_customer text, note_internal text, vehiclenote text
);

create table public.vehicle_journey_periods (
  period_id uuid primary key default gen_random_uuid(), regnr text not null, period_type text not null default 'DOWNTIME',
  started_at timestamptz not null, ended_at timestamptz, reason_code text, reason_text text, source_system text,
  source_entity text, source_record_id text, source_event_id uuid, metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.vehicle_journey_activity_periods (
  activity_period_id uuid primary key default gen_random_uuid(), parent_period_id uuid not null references public.vehicle_journey_periods(period_id),
  regnr text not null, activity_type text not null, started_at timestamptz not null, ended_at timestamptz, reason_text text,
  source_system text,source_entity text,source_record_id text,source_event_id uuid,metadata jsonb default '{}'::jsonb,
  created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.vehicle_journey_events (
  event_id uuid primary key default gen_random_uuid(), regnr text not null,event_type text not null,event_key text not null unique,
  occurred_at timestamptz not null,source_system text not null,source_entity text,source_record_id text,actor_id uuid,actor_source text not null,
  actor_email text,payload jsonb not null default '{}'::jsonb
);

create table public.garage_avveckla_cases (
  avveckla_case_id uuid primary key default gen_random_uuid(),garage_item_id uuid not null unique references public.garage_items(garage_item_id),
  regnr text not null,reason text not null,status text not null default 'OPEN',started_at timestamptz not null default now(),started_by uuid not null,
  started_by_email text,completed_at timestamptz,completed_by uuid,completion_event_id uuid,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.garage_avveckla_points (
  point_id uuid primary key default gen_random_uuid(),avveckla_case_id uuid not null references public.garage_avveckla_cases(avveckla_case_id),
  status text not null default 'OPEN'
);
create table public.garage_avveckla_events (
  event_id uuid primary key default gen_random_uuid(),avveckla_case_id uuid not null references public.garage_avveckla_cases(avveckla_case_id),
  garage_item_id uuid not null references public.garage_items(garage_item_id),regnr text not null,point_id uuid,event_type text not null,event_key text not null unique,
  occurred_at timestamptz not null default now(),actor_id uuid not null,actor_email text,actor_source text not null default 'MANUELL',
  evidence_reference text,payload jsonb not null default '{}'::jsonb,created_at timestamptz default now()
);
alter table public.garage_avveckla_cases add constraint garage_avveckla_cases_completion_event_fk foreign key(completion_event_id) references public.garage_avveckla_events(event_id);

create table public.garage_avveckla_transport_bookings (
  booking_id uuid primary key default gen_random_uuid(),avveckla_case_id uuid not null unique references public.garage_avveckla_cases(avveckla_case_id),
  garage_item_id uuid not null unique references public.garage_items(garage_item_id),regnr text not null,booked_at timestamptz not null,deadline_at timestamptz not null,
  booked_by uuid not null,booked_by_email text,booking_reference text,picked_up_at timestamptz,pickup_event_id uuid references public.garage_avveckla_events(event_id),
  deviation_at timestamptz,alert_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.garage_avveckla_transport_events (
  transport_event_id uuid primary key default gen_random_uuid(),booking_id uuid not null,avveckla_case_id uuid not null,garage_item_id uuid not null,regnr text not null,
  event_type text not null,event_key text not null unique,occurred_at timestamptz not null,actor_id uuid,actor_email text,actor_source text not null,payload jsonb default '{}'::jsonb
);
create table public.billable_driving_events (
  billing_event_id uuid primary key default gen_random_uuid(),source_event_id uuid not null unique references public.garage_avveckla_events(event_id),
  garage_item_id uuid not null,avveckla_case_id uuid not null,regnr text not null,event_type text not null default 'FAKTURERBAR_KORNING',from_location text not null,to_location text not null,
  price_class text,base_price numeric,price numeric not null,price_basis text not null,price_list_id text not null,price_list_version text not null,performed_at timestamptz not null,
  performed_by uuid,performed_by_email text,billing_status text not null default 'EJ_FAKTURERAD',invoice_number text,invoiced_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.billable_driving_event_history (
  history_id uuid primary key default gen_random_uuid(),billing_event_id uuid not null,event_type text not null,event_key text not null unique,previous_status text,status text not null,
  occurred_at timestamptz not null,actor_id uuid,actor_email text,payload jsonb default '{}'::jsonb
);

create or replace function public.assert_garage_avveckla_ready_for_completion(p_garage_item_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_case uuid; v_open integer; begin
  select avveckla_case_id into v_case from public.garage_avveckla_cases where garage_item_id=p_garage_item_id and status='OPEN' for update;
  if v_case is null then raise exception 'AVVECKLA-ärende saknas'; end if;
  select count(*) into v_open from public.garage_avveckla_points where avveckla_case_id=v_case and status='OPEN';
  if v_open>0 then raise exception 'ÖPPEN AVVECKLA-punkt'; end if; return v_case;
end $$;

create table public.fleet_membership_facts (
  fact_id uuid primary key default gen_random_uuid(),identity_id uuid not null,membership_state text not null,basis text not null,effective_at timestamptz not null,
  source_system text not null,source_entity text not null,source_record_id text,source_event_id text not null,actor_id uuid,actor_source text,actor_name text,actor_email text,
  evidence jsonb default '{}'::jsonb,predecessor_fact_ids uuid[] default '{}'::uuid[],correction_of_fact_id uuid
);
create unique index fleet_membership_source_fixture_uidx on public.fleet_membership_facts(source_system,source_entity,source_event_id);
create table public.fleet_membership_current_by_identity (
  identity_id uuid primary key,resolution_reason text not null,membership_fact_id uuid,membership_state text,effective_at timestamptz
);
create table public.fleet_membership_bootstrap_batch_status (bootstrap_denominator_eligible boolean not null);
insert into public.fleet_membership_bootstrap_batch_status values(true);

create or replace function public.lock_fleet_membership_cutover() returns void language sql security definer set search_path=pg_catalog as $$ select pg_advisory_xact_lock(991991); $$;
create or replace function public.resolve_fleet_identity_from_verified_source(text,text,timestamptz,text,text,text,text,jsonb)
returns uuid language sql security definer set search_path=pg_catalog as $$ select '70000000-0000-4000-8000-000000000001'::uuid; $$;
create or replace function public.append_fleet_membership_fact(
  p_identity_id uuid,p_membership_state text,p_basis text,p_effective_at timestamptz,p_source_system text,p_source_entity text,p_source_record_id text,p_source_event_id text,
  p_actor_id uuid,p_actor_source text,p_actor_name text,p_actor_email text,p_evidence jsonb,p_predecessor_fact_ids uuid[],p_correction_of_fact_id uuid
) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v uuid; begin
  insert into public.fleet_membership_facts(identity_id,membership_state,basis,effective_at,source_system,source_entity,source_record_id,source_event_id,actor_id,actor_source,actor_name,actor_email,evidence,predecessor_fact_ids,correction_of_fact_id)
  values(p_identity_id,p_membership_state,p_basis,p_effective_at,p_source_system,p_source_entity,p_source_record_id,p_source_event_id,p_actor_id,p_actor_source,p_actor_name,p_actor_email,p_evidence,p_predecessor_fact_ids,p_correction_of_fact_id)
  returning fact_id into v; return v; end $$;

insert into public.fleet_membership_facts(fact_id,identity_id,membership_state,basis,effective_at,source_system,source_entity,source_event_id,actor_source)
values('70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','ACTIVE','CURRENT_BASELINE','2026-09-14T12:57:04Z','CANONICAL_BOOTSTRAP','fixture','bootstrap-active','MANUELL');
insert into public.fleet_membership_current_by_identity(identity_id,resolution_reason,membership_fact_id,membership_state,effective_at)
values('70000000-0000-4000-8000-000000000001','RESOLVED','70000000-0000-4000-8000-000000000002','ACTIVE','2026-09-14T12:57:04Z');

revoke all on public.garage_avveckla_cases,public.garage_avveckla_points,public.garage_avveckla_events from service_role;
grant select on public.garage_avveckla_cases,public.garage_avveckla_points,public.garage_avveckla_events to service_role;
grant select,insert,update on public.garage_avveckla_transport_bookings,public.garage_avveckla_transport_events,public.billable_driving_events,public.billable_driving_event_history to service_role;
SQL

"${PSQL[@]}" -f migrations/20260916013000_salu_v2_step4_buhs_handoff.sql
"${PSQL[@]}" -f migrations/20260916013100_salu_v2_step4_terminal_bridge.sql

"${PSQL[@]}" <<'SQL'
-- Capture locked history counts before Step 4 work.
create temporary table step4_before as
select (select count(*) from public.salu_plans) plans,
       (select count(*) from public.garage_sista_hyran_decisions) decisions,
       (select count(*) from public.garage_sista_incheckningar) finals;

-- Direct service-role fabrication is denied.
do $$ begin
  if has_table_privilege('service_role','public.salu_v2_buhs_verifications','INSERT') then raise exception 'service_role can fabricate BUHS verification'; end if;
  if has_table_privilege('service_role','public.salu_v2_buhs_verification_rows','INSERT') then raise exception 'service_role can fabricate BUHS row PASS'; end if;
  if has_table_privilege('service_role','public.garage_salu_v2_avveckla_handoffs','INSERT') then raise exception 'service_role can fabricate SALU handoff'; end if;
end $$;

-- Without Step 3 final -> REJECT.
do $$ begin
  begin
    perform public.verify_salu_v2_buhs_v1('99999999-0000-4000-8000-000000000001','{}'::uuid[],'missing-final','chief@example.com','91000000-0000-4000-8000-000000000001');
    raise exception 'missing Step3 final passed';
  exception when no_data_found or raise_exception then
    if sqlerrm='missing Step3 final passed' then raise; end if;
  end;
end $$;

-- Use the exact locked Step 3 final from the Step 3 acceptance fixture.
do $$ declare v_final public.garage_sista_incheckningar%rowtype; begin
  select * into v_final from public.garage_sista_incheckningar order by verified_at limit 1;
  insert into public.vehicle_journey_periods(period_id,regnr,period_type,started_at,source_system,source_entity,source_record_id)
  values('80000000-0000-4000-8000-000000000001',v_final.regnr,'DOWNTIME',v_final.final_checkin_completed_at - interval '1 hour','CHECKIN','checkins',v_final.checkin_id::text);
end $$;

-- Unauthorized actor -> REJECT even with empty source set.
do $$ declare v_final uuid; begin
  select sista_incheckning_id into v_final from public.garage_sista_incheckningar order by verified_at limit 1;
  begin
    perform public.verify_salu_v2_buhs_v1(v_final,'{}'::uuid[],'unauthorized','not-an-employee@example.com','91000000-0000-4000-8000-000000000099');
    raise exception 'unauthorized BUHS verification passed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Grant the explicit new capability to the already-active BILKONTROLLCHEF fixture. No email/name allowlist.
insert into public.employee_mandates(mandate_id,employee_id,function_code,capability_code,scope_type,scope_code,active,grant_reason)
values('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','BILKONTROLLCHEF','SALU_BUHS_VERIFY','PROCESS','SALU',true,'Step4 CI fixture');

-- 0-row source set is an explicit verified PASS snapshot.
do $$ declare v_final uuid; v_result jsonb; begin
  select sista_incheckning_id into v_final from public.garage_sista_incheckningar order by verified_at limit 1;
  v_result:=public.verify_salu_v2_buhs_v1(v_final,'{}'::uuid[],'zero-pass','chief@example.com','91000000-0000-4000-8000-000000000001');
  if (v_result->>'source_row_count')::int<>0 or v_result->>'total_result'<>'PASS' then raise exception '0-row explicit PASS failed: %',v_result; end if;
end $$;

-- Change BUHS source set after the snapshot. Old snapshot must become terminally stale.
do $$ declare v_final public.garage_sista_incheckningar%rowtype; begin
  select * into v_final from public.garage_sista_incheckningar order by verified_at limit 1;
  insert into public.damages(id,regnr,source,damage_date,damage_type_raw) values
   ('81000000-0000-4000-8000-000000000001',v_final.regnr,'BUHS','2026-01-01','BUHS A'),
   ('81000000-0000-4000-8000-000000000002',v_final.regnr,'BUHS','2026-01-02','BUHS B');
end $$;

do $$ declare v_final uuid; v_old uuid; begin
  select sista_incheckning_id into v_final from public.garage_sista_incheckningar order by verified_at limit 1;
  select buhs_verification_id into v_old from public.salu_v2_buhs_verifications where sista_incheckning_id=v_final and revision_no=1;
  begin
    perform public.start_salu_v2_avveckla_v1(v_final,v_old,'91000000-0000-4000-8000-000000000001','chief@example.com');
    raise exception 'stale BUHS snapshot opened AVVECKLA';
  exception when raise_exception then
    if sqlerrm='stale BUHS snapshot opened AVVECKLA' then raise; end if;
  end;
end $$;

-- Missing explicit PASS for one current damages.id -> REJECT.
do $$ declare v_final uuid; begin
  select sista_incheckning_id into v_final from public.garage_sista_incheckningar order by verified_at limit 1;
  begin
    perform public.verify_salu_v2_buhs_v1(v_final,array['81000000-0000-4000-8000-000000000001'::uuid],'missing-row','chief@example.com','91000000-0000-4000-8000-000000000001');
    raise exception 'partial BUHS PASS passed';
  exception when raise_exception then
    if sqlerrm='partial BUHS PASS passed' then raise; end if;
  end;
end $$;

-- Exact current source set + explicit PASS for every row -> revision 2 PASS, retry idempotent.
do $$ declare v_final uuid; v_first jsonb; v_retry jsonb; begin
  select sista_incheckning_id into v_final from public.garage_sista_incheckningar order by verified_at limit 1;
  v_first:=public.verify_salu_v2_buhs_v1(v_final,array['81000000-0000-4000-8000-000000000001'::uuid,'81000000-0000-4000-8000-000000000002'::uuid],
    'two-pass','chief@example.com','91000000-0000-4000-8000-000000000001');
  v_retry:=public.verify_salu_v2_buhs_v1(v_final,array['81000000-0000-4000-8000-000000000001'::uuid,'81000000-0000-4000-8000-000000000002'::uuid],
    'two-pass','chief@example.com','91000000-0000-4000-8000-000000000001');
  if (v_first->>'buhs_verification_id') is distinct from (v_retry->>'buhs_verification_id') or coalesce((v_retry->>'idempotentReplay')::boolean,false) is not true then
    raise exception 'BUHS retry duplicated snapshot'; end if;
end $$;

-- Exact Step3 + current BUHS PASS -> exact handoff; SALU_PLANERING remains directionless; retry returns same handoff.
do $$ declare v_final public.garage_sista_incheckningar%rowtype; v_buhs uuid; v_first jsonb; v_retry jsonb; begin
  select * into v_final from public.garage_sista_incheckningar order by verified_at limit 1;
  select buhs_verification_id into v_buhs from public.salu_v2_buhs_verifications where sista_incheckning_id=v_final.sista_incheckning_id and revision_no=2;
  v_first:=public.start_salu_v2_avveckla_v1(v_final.sista_incheckning_id,v_buhs,'91000000-0000-4000-8000-000000000001','chief@example.com');
  v_retry:=public.start_salu_v2_avveckla_v1(v_final.sista_incheckning_id,v_buhs,'91000000-0000-4000-8000-000000000001','chief@example.com');
  if (v_first->>'salu_v2_handoff_id') is distinct from (v_retry->>'salu_v2_handoff_id') then raise exception 'handoff retry duplicated'; end if;
  if exists(select 1 from public.garage_items where garage_item_id=v_final.garage_item_id and garage_direction is not null) then raise exception 'SALU_PLANERING was fabricated as UT'; end if;
end $$;

-- Prove downstream failure rolls back terminal event + canonical EXIT atomically.
create or replace function public.step4_force_layer1_failure() returns trigger language plpgsql as $$ begin raise exception 'forced downstream layer1 failure'; end $$;
create trigger step4_force_layer1_failure before update of ended_at on public.vehicle_journey_periods for each row execute function public.step4_force_layer1_failure();

do $$ declare v_item uuid; v_terminal_at timestamptz; begin
  select h.garage_item_id,
         greatest(clock_timestamp(),p.started_at,f.final_checkin_completed_at) + interval '1 second'
    into v_item,v_terminal_at
  from public.garage_salu_v2_avveckla_handoffs h
  join public.garage_sista_incheckningar f on f.sista_incheckning_id=h.sista_incheckning_id
  join public.vehicle_journey_periods p on p.period_id=h.journey_period_id
  limit 1;
  begin
    perform public.verify_salu_v2_avveckla_avstallning_v1(v_item,v_terminal_at,'CI terminal evidence','91000000-0000-4000-8000-000000000001','chief@example.com');
    raise exception 'forced downstream failure unexpectedly committed';
  exception when raise_exception then
    if sqlerrm='forced downstream failure unexpectedly committed' then raise; end if;
    if sqlerrm<>'forced downstream layer1 failure' then
      raise exception 'forced downstream failure did not reach Layer1 trigger: %',sqlerrm;
    end if;
  end;
end $$;

do $$ declare v_terminal integer; v_exit integer; begin
  select count(*) into v_terminal from public.garage_avveckla_events where event_type in ('UT_OVERLAMNING_VERIFIERAD','UT_TRANSPORTOR_HAMTAT_VERIFIERAD','UT_AVSTALLNING_VERIFIERAD');
  select count(*) into v_exit from public.fleet_membership_facts where source_system='GARAGE_AVVECKLA' and basis='EXIT';
  if v_terminal<>0 or v_exit<>0 then raise exception 'terminal rollback failed: events %, exits %',v_terminal,v_exit; end if;
end $$;

drop trigger step4_force_layer1_failure on public.vehicle_journey_periods;
drop function public.step4_force_layer1_failure();

-- Successful SALU V2 terminal: exact bound Layer1 close without durationHours + exactly one existing canonical EXIT path.
do $$ declare v_item uuid; v_terminal_at timestamptz; v_result jsonb; v_retry jsonb; begin
  select h.garage_item_id,
         greatest(clock_timestamp(),p.started_at,f.final_checkin_completed_at) + interval '1 second'
    into v_item,v_terminal_at
  from public.garage_salu_v2_avveckla_handoffs h
  join public.garage_sista_incheckningar f on f.sista_incheckning_id=h.sista_incheckning_id
  join public.vehicle_journey_periods p on p.period_id=h.journey_period_id
  limit 1;
  v_result:=public.verify_salu_v2_avveckla_avstallning_v1(v_item,v_terminal_at,'CI terminal evidence','91000000-0000-4000-8000-000000000001','chief@example.com');
  v_retry:=public.verify_salu_v2_avveckla_avstallning_v1(v_item,(v_result->>'completed_at')::timestamptz,'CI terminal evidence','91000000-0000-4000-8000-000000000001','chief@example.com');
  if (v_result->>'completion_event_id') is distinct from (v_retry->>'completion_event_id') then raise exception 'terminal retry duplicated event'; end if;
end $$;

do $$ declare v_exit integer; v_terminal integer; v_period integer; v_archive integer; begin
  select count(*) into v_exit from public.fleet_membership_facts where source_system='GARAGE_AVVECKLA' and source_entity='garage_avveckla_events' and basis='EXIT' and membership_state='INACTIVE';
  select count(*) into v_terminal from public.garage_avveckla_events where salu_v2_handoff_id is not null and event_type in ('UT_OVERLAMNING_VERIFIERAD','UT_TRANSPORTOR_HAMTAT_VERIFIERAD','UT_AVSTALLNING_VERIFIERAD');
  select count(*) into v_period from public.vehicle_journey_events where event_type='PERIOD_ENDED' and source_system='GARAGE_AVVECKLA' and payload ? 'durationHours';
  select count(*) into v_archive from public.salu_v2_avvecklad_current;
  if v_exit<>1 then raise exception 'canonical EXIT count expected 1 got %',v_exit; end if;
  if v_terminal<>1 then raise exception 'terminal event count expected 1 got %',v_terminal; end if;
  if v_period<>0 then raise exception 'SALU V2 produced durationHours'; end if;
  if v_archive<>1 then raise exception 'AVVECKLAD read state missing'; end if;
end $$;

-- Step 1/2/3 history counts are unchanged by Step 4.
do $$ declare b record; begin
  select * into b from step4_before;
  if b.plans<>(select count(*) from public.salu_plans) then raise exception 'Step1 history changed'; end if;
  if b.decisions<>(select count(*) from public.garage_sista_hyran_decisions) then raise exception 'Step2 history changed'; end if;
  if b.finals<>(select count(*) from public.garage_sista_incheckningar) then raise exception 'Step3 history changed'; end if;
end $$;

select 'unauthorized BUHS actor REJECT PASS' as result;
select '0-row explicit BUHS PASS PASS' as result;
select 'stale BUHS source-set REJECT PASS' as result;
select 'partial BUHS PASS REJECT PASS' as result;
select 'exact Step3 + BUHS handoff PASS' as result;
select 'SALU_PLANERING directionless PASS' as result;
select 'terminal rollback atomicity PASS' as result;
select 'SALU V2 no durationHours PASS' as result;
select 'canonical EXIT exactly once PASS' as result;
select 'ARKIV read state PASS' as result;
select 'Step1/2/3 history unchanged PASS' as result;
select 'SALU V2 Step 4 PostgreSQL acceptance PASS' as result;
SQL
