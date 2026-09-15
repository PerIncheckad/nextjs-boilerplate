#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 -X)

# Step 2 is additive to the exact Step 1 contract. Rebuild and prove Step 1 first.
bash scripts/test-salu-v2-step1-postgres.sh

"${PSQL[@]}" <<'SQL'
-- Minimal current-main fields needed by Step 2 in the isolated acceptance harness.
alter table public.garage_items
  add column planned_station text,
  add column handed_off_nybil_id uuid,
  add column completed_at timestamptz;

create table public.employees (
  id uuid primary key,
  full_name text not null,
  email text,
  active boolean,
  is_active boolean not null default true
);
SQL

"${PSQL[@]}" -f migrations/20260823191000_add_roles_mandates_contract_v1.sql
"${PSQL[@]}" -f migrations/20260825212000_add_module_access_capabilities_v1.sql
"${PSQL[@]}" -f migrations/20260915181000_salu_v2_step2_garage_sista_hyran.sql
"${PSQL[@]}" -f migrations/20260915182500_salu_v2_step2_employee_identity_boundary.sql

"${PSQL[@]}" <<'SQL'
-- Step 2 must add the capability definition but must not seed a Production person mandate.
do $$
declare v_count integer;
begin
  if not exists (
    select 1 from public.mandate_capability_definitions
    where capability_code='GARAGE_SISTA_HYRAN_DECIDE' and active
  ) then
    raise exception 'GARAGE_SISTA_HYRAN_DECIDE capability missing';
  end if;

  select count(*) into v_count from public.employee_mandates;
  if v_count <> 0 then raise exception 'Step 2 unexpectedly seeded employee mandates: %', v_count; end if;
end;
$$;

-- Transactional authorization fixtures only.
insert into public.employees(id,full_name,email,active,is_active) values
  ('10000000-0000-4000-8000-000000000001','Good chief','chief@example.com',true,true),
  ('10000000-0000-4000-8000-000000000002','Access only','access@example.com',true,true),
  ('10000000-0000-4000-8000-000000000003','Bilkontroll wrong function','bilkontroll@example.com',true,true),
  ('10000000-0000-4000-8000-000000000004','No mandate','none@example.com',true,true),
  ('10000000-0000-4000-8000-000000000005','Duplicate A','duplicate@example.com',true,true),
  ('10000000-0000-4000-8000-000000000006','Duplicate B','duplicate@example.com',true,true);

insert into public.employee_mandates(
  mandate_id,employee_id,function_code,capability_code,scope_type,scope_code,active,grant_reason
) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','BILKONTROLLCHEF','GARAGE_SISTA_HYRAN_DECIDE','PROCESS','SALU',true,'CI fixture'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','BILKONTROLLCHEF','ACCESS_GARAGE','GLOBAL',null,true,'CI fixture'),
  ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','BILKONTROLL','GARAGE_SISTA_HYRAN_DECIDE','PROCESS','SALU',true,'CI fixture');

-- Exact mandate contract: only BILKONTROLLCHEF + decision capability + PROCESS/SALU passes.
do $$
begin
  if not public.actor_has_process_mandate(
    '10000000-0000-4000-8000-000000000001',
    'GARAGE_SISTA_HYRAN_DECIDE','BILKONTROLLCHEF','PROCESS','SALU',now()
  ) then raise exception 'correct SISTA HYRAN mandate unexpectedly rejected'; end if;

  if public.actor_has_process_mandate(
    '10000000-0000-4000-8000-000000000002',
    'GARAGE_SISTA_HYRAN_DECIDE','BILKONTROLLCHEF','PROCESS','SALU',now()
  ) then raise exception 'ACCESS_GARAGE incorrectly became decision mandate'; end if;

  if public.actor_has_process_mandate(
    '10000000-0000-4000-8000-000000000003',
    'GARAGE_SISTA_HYRAN_DECIDE','BILKONTROLLCHEF','PROCESS','SALU',now()
  ) then raise exception 'BILKONTROLL incorrectly satisfied BILKONTROLLCHEF'; end if;

  if public.actor_has_process_mandate(
    '10000000-0000-4000-8000-000000000004',
    'GARAGE_SISTA_HYRAN_DECIDE','BILKONTROLLCHEF','PROCESS','SALU',now()
  ) then raise exception 'missing mandate unexpectedly passed'; end if;
end;
$$;

-- Identity boundary must deny missing and ambiguous employee resolution.
do $$
begin
  begin
    perform public.resolve_active_employee_identity_v1('missing@example.com');
    raise exception 'missing employee identity unexpectedly resolved';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.resolve_active_employee_identity_v1('duplicate@example.com');
    raise exception 'ambiguous employee identity unexpectedly resolved';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Use the Step 1 QUICK fixture as the exact Step 2 SALU_PLANERING object.
do $$
declare
  v_item_id uuid;
  v_plan public.salu_plans%rowtype;
  v_events integer;
  v_decisions integer;
begin
  select garage_item_id into v_item_id
  from public.garage_items
  where source_kind='SALU_PLANERING'
    and source_salu_flag_id='11111111-1111-4111-8111-111111111111';

  if v_item_id is null then raise exception 'Step 1 SALU_PLANERING fixture missing'; end if;

  -- DB invariant: generic/direct write cannot fabricate physical direction.
  begin
    update public.garage_items
    set garage_direction='IN', updated_by='90000000-0000-4000-8000-000000000001'
    where garage_item_id=v_item_id;
    raise exception 'SALU_PLANERING accepted fabricated IN direction';
  exception when check_violation then null;
  end;

  begin
    update public.garage_items
    set garage_direction='UT', updated_by='90000000-0000-4000-8000-000000000001'
    where garage_item_id=v_item_id;
    raise exception 'SALU_PLANERING accepted fabricated UT direction';
  exception when check_violation then null;
  end;

  -- A timing value alone is decision support, never the decision itself.
  update public.garage_items
  set salu_final_timing_at='2026-10-14 16:00:00+00',
      salu_transport_details='Transportör bokas efter sista hyran',
      salu_repair_destination='Verkstad Syd',
      salu_operational_note='Garage komplettering',
      transport_status='TRANSPORTBOKAD',
      updated_at=clock_timestamp(),
      updated_by='90000000-0000-4000-8000-000000000001'
  where garage_item_id=v_item_id;

  select count(*) into v_decisions
  from public.garage_sista_hyran_decisions
  where garage_item_id=v_item_id;
  if v_decisions <> 0 then raise exception 'timing/update inferred SISTA HYRAN'; end if;

  select count(*) into v_events
  from public.garage_salu_operational_events
  where garage_item_id=v_item_id;
  if v_events <> 5 then raise exception 'expected 5 audited operational field changes, got %', v_events; end if;

  select * into v_plan from public.salu_plans
  where flag_id='11111111-1111-4111-8111-111111111111';
  if v_plan.source_saludatum <> date '2026-10-15'
     or v_plan.planned_saludatum <> date '2026-10-15'
     or v_plan.status <> 'PLANERAD'
     or v_plan.proposed_end_date is not null
     or v_plan.salu_destination is not null
     or v_plan.note is not null then
    raise exception 'Garage complement rewrote original SALU plan';
  end if;
end;
$$;

-- ACCESS_GARAGE alone must not authorize the explicit decision.
do $$
declare v_item_id uuid;
begin
  select garage_item_id into v_item_id from public.garage_items
  where source_kind='SALU_PLANERING' and source_salu_flag_id='11111111-1111-4111-8111-111111111111';
  begin
    perform public.decide_garage_sista_hyran_v1(
      v_item_id,'access@example.com','91000000-0000-4000-8000-000000000002',
      '2026-10-14 16:00:00+00','access only','deny-access'
    );
    raise exception 'ACCESS_GARAGE unexpectedly authorized SISTA HYRAN';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Decision capability in BILKONTROLL, rather than BILKONTROLLCHEF, must reject.
do $$
declare v_item_id uuid;
begin
  select garage_item_id into v_item_id from public.garage_items
  where source_kind='SALU_PLANERING' and source_salu_flag_id='11111111-1111-4111-8111-111111111111';
  begin
    perform public.decide_garage_sista_hyran_v1(
      v_item_id,'bilkontroll@example.com','91000000-0000-4000-8000-000000000003',
      null,'wrong function','deny-function'
    );
    raise exception 'BILKONTROLL unexpectedly satisfied BILKONTROLLCHEF';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Missing mandate must reject.
do $$
declare v_item_id uuid;
begin
  select garage_item_id into v_item_id from public.garage_items
  where source_kind='SALU_PLANERING' and source_salu_flag_id='11111111-1111-4111-8111-111111111111';
  begin
    perform public.decide_garage_sista_hyran_v1(
      v_item_id,'none@example.com','91000000-0000-4000-8000-000000000004',
      null,'no mandate','deny-none'
    );
    raise exception 'missing mandate unexpectedly authorized SISTA HYRAN';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Auth UUID without exact employee resolution must reject. Auth UUID is never employees.id.
do $$
declare v_item_id uuid;
begin
  select garage_item_id into v_item_id from public.garage_items
  where source_kind='SALU_PLANERING' and source_salu_flag_id='11111111-1111-4111-8111-111111111111';
  begin
    perform public.decide_garage_sista_hyran_v1(
      v_item_id,'auth-only@example.com','10000000-0000-4000-8000-000000000001',
      null,'auth uuid only','deny-auth-only'
    );
    raise exception 'auth UUID without employee resolution unexpectedly authorized SISTA HYRAN';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Explicit authorized decision, retry idempotency and later version history.
do $$
declare
  v_item_id uuid;
  v_first jsonb;
  v_retry jsonb;
  v_second jsonb;
  v_count integer;
  v_current_version integer;
  v_current_timing timestamptz;
  v_status text;
  v_outcome text;
begin
  select garage_item_id into v_item_id from public.garage_items
  where source_kind='SALU_PLANERING' and source_salu_flag_id='11111111-1111-4111-8111-111111111111';

  v_first := public.decide_garage_sista_hyran_v1(
    v_item_id,'chief@example.com','91000000-0000-4000-8000-000000000001',
    '2026-10-14 16:00:00+00','Första explicita beslutet','decision-1'
  );
  if coalesce((v_first->>'sistaHyran')::boolean,false) is not true
     or coalesce((v_first->>'idempotentReplay')::boolean,true) is not false then
    raise exception 'first SISTA HYRAN decision result invalid: %', v_first;
  end if;

  v_retry := public.decide_garage_sista_hyran_v1(
    v_item_id,'chief@example.com','91000000-0000-4000-8000-000000000001',
    '2026-10-14 16:00:00+00','Första explicita beslutet','decision-1'
  );
  if coalesce((v_retry->>'idempotentReplay')::boolean,false) is not true then
    raise exception 'retry did not report idempotent replay: %', v_retry;
  end if;

  select count(*) into v_count from public.garage_sista_hyran_decisions where garage_item_id=v_item_id;
  if v_count <> 1 then raise exception 'retry fabricated duplicate decision, count %', v_count; end if;

  v_second := public.decide_garage_sista_hyran_v1(
    v_item_id,'chief@example.com','91000000-0000-4000-8000-000000000001',
    '2026-10-14 18:00:00+00','Ändrad innan nästa låsta fas','decision-2'
  );

  select count(*) into v_count from public.garage_sista_hyran_decisions where garage_item_id=v_item_id;
  if v_count <> 2 then raise exception 'later decision did not preserve history, count %', v_count; end if;

  if not exists (
    select 1 from public.garage_sista_hyran_decisions newer
    join public.garage_sista_hyran_decisions older on older.decision_id=newer.supersedes_decision_id
    where newer.garage_item_id=v_item_id and newer.decision_version=2 and older.decision_version=1
  ) then raise exception 'later SISTA HYRAN version did not supersede preserved version 1'; end if;

  select decision_version,last_rental_at into v_current_version,v_current_timing
  from public.garage_sista_hyran_current where garage_item_id=v_item_id;
  if v_current_version <> 2 or v_current_timing <> '2026-10-14 18:00:00+00'::timestamptz then
    raise exception 'Step 3 read contract did not expose current explicit decision';
  end if;

  select status,closure_outcome into v_status,v_outcome
  from public.salu_flags where flag_id='11111111-1111-4111-8111-111111111111';
  if v_status <> 'NY' or v_outcome is not null then
    raise exception 'SISTA HYRAN terminally changed SALU: status %, outcome %', v_status,v_outcome;
  end if;

  if (v_second->>'terminalClosure')::boolean
     or (v_second->>'avvecklaStarted')::boolean
     or (v_second->>'canonicalFleetExit')::boolean
     or (v_second->>'checkinWritten')::boolean
     or (v_second->>'physicalGaragePositionChanged')::boolean then
    raise exception 'SISTA HYRAN crossed a Step 2 boundary: %', v_second;
  end if;
end;
$$;

-- Decision history is immutable.
do $$
begin
  begin
    update public.garage_sista_hyran_decisions set decision_note='forbidden';
    raise exception 'SISTA HYRAN history accepted UPDATE';
  exception when raise_exception then
    if sqlerrm = 'SISTA HYRAN history accepted UPDATE' then raise; end if;
  end;

  begin
    delete from public.garage_sista_hyran_decisions;
    raise exception 'SISTA HYRAN history accepted DELETE';
  exception when raise_exception then
    if sqlerrm = 'SISTA HYRAN history accepted DELETE' then raise; end if;
  end;
end;
$$;

-- Legacy current-main source rows and direction semantics remain untouched.
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.garage_items
  where source_kind in ('MANUELL','PLANERING','SALU','LAGER1');
  if v_count <> 4 then raise exception 'legacy Garage source rows changed, count %', v_count; end if;

  if not exists (
    select 1 from public.garage_items
    where source_kind='SALU' and garage_direction='UT'
      and source_salu_flag_id='44444444-4444-4444-8444-444444444444'
  ) then raise exception 'historical SALU -> Garage UT semantics changed'; end if;
end;
$$;

select 'SALU V2 Step 2 PostgreSQL acceptance PASS' as result;
SQL
