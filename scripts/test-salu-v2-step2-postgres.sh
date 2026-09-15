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
  is_active boolean not null default true,
  station text,
  station_scope text not null default 'SINGLE'
    check (station_scope in ('SINGLE','ALL'))
);
SQL

"${PSQL[@]}" -f migrations/20260823191000_add_roles_mandates_contract_v1.sql
"${PSQL[@]}" -f migrations/20260825212000_add_module_access_capabilities_v1.sql
"${PSQL[@]}" -f migrations/20260915181000_salu_v2_step2_garage_sista_hyran.sql

"${PSQL[@]}" <<'SQL'
-- Step 2 must add the final registry definitions but must not seed a Production person mandate.
do $$
declare v_count integer;
begin
  if not exists (
    select 1 from public.mandate_capability_definitions
    where capability_code='GARAGE_SISTA_HYRAN_DECIDE' and active
  ) then
    raise exception 'GARAGE_SISTA_HYRAN_DECIDE capability missing';
  end if;
  if not exists (
    select 1 from public.business_function_definitions
    where function_code='VD' and active
  ) then
    raise exception 'VD business function missing';
  end if;

  select count(*) into v_count from public.employee_mandates;
  if v_count <> 0 then raise exception 'Step 2 unexpectedly seeded employee mandates: %', v_count; end if;
end;
$$;

-- Transactional authorization fixtures only. None are Production assignments.
insert into public.employees(id,full_name,email,active,is_active,station,station_scope) values
  ('10000000-0000-4000-8000-000000000001','Good chief','chief@example.com',true,true,'166','SINGLE'),
  ('10000000-0000-4000-8000-000000000002','Access only','access@example.com',true,true,'166','SINGLE'),
  ('10000000-0000-4000-8000-000000000003','Bilkontroll wrong function','bilkontroll@example.com',true,true,'166','SINGLE'),
  ('10000000-0000-4000-8000-000000000004','No mandate','none@example.com',true,true,'166','SINGLE'),
  ('10000000-0000-4000-8000-000000000005','Duplicate A','duplicate@example.com',true,true,'166','SINGLE'),
  ('10000000-0000-4000-8000-000000000006','Duplicate B','duplicate@example.com',true,true,'166','SINGLE'),
  ('10000000-0000-4000-8000-000000000007','VD fixture','vd@example.com',true,true,null,'ALL'),
  ('10000000-0000-4000-8000-000000000008','Stationschef own','station-own@example.com',true,true,'166','SINGLE'),
  ('10000000-0000-4000-8000-000000000009','Stationschef other','station-other@example.com',true,true,'170','SINGLE'),
  ('10000000-0000-4000-8000-000000000010','Stationschef ALL other','station-all-other@example.com',true,true,'170','ALL');

insert into public.employee_mandates(
  mandate_id,employee_id,function_code,capability_code,scope_type,scope_code,active,grant_reason
) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','BILKONTROLLCHEF','GARAGE_SISTA_HYRAN_DECIDE','PROCESS','SALU',true,'CI fixture'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','BILKONTROLLCHEF','ACCESS_GARAGE','GLOBAL',null,true,'CI fixture'),
  ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','BILKONTROLL','GARAGE_SISTA_HYRAN_DECIDE','PROCESS','SALU',true,'CI fixture'),
  ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000007','VD','GARAGE_SISTA_HYRAN_DECIDE','PROCESS','SALU',true,'CI fixture'),
  ('20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000008','STATIONSCHEF','GARAGE_SISTA_HYRAN_DECIDE','PROCESS','SALU',true,'CI fixture'),
  ('20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000009','STATIONSCHEF','GARAGE_SISTA_HYRAN_DECIDE','PROCESS','SALU',true,'CI fixture'),
  ('20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010','STATIONSCHEF','GARAGE_SISTA_HYRAN_DECIDE','PROCESS','SALU',true,'CI fixture');

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

-- Use the Step 1 QUICK fixture as exact Step 2 SALU_PLANERING object and bind its current Garage station.
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

  -- Current Garage station is source-owned by Garage and is the Stationschef authorization boundary.
  update public.garage_items
  set planned_station='166',
      updated_at=clock_timestamp(),
      updated_by='90000000-0000-4000-8000-000000000001'
  where garage_item_id=v_item_id;

  -- A timing value alone is decision support, never the decision itself.
  update public.garage_items
  set salu_final_timing_at=public.swedish_local_datetime_to_timestamptz_v1('2026-10-14T16:00'),
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
  if v_events <> 6 then raise exception 'expected 6 audited operational field changes including station, got %', v_events; end if;

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

-- Canonical authorization matrix is item-aware.
do $$
declare v_item_id uuid;
begin
  select garage_item_id into v_item_id from public.garage_items
  where source_kind='SALU_PLANERING' and source_salu_flag_id='11111111-1111-4111-8111-111111111111';

  if not public.actor_can_decide_garage_sista_hyran_v1('10000000-0000-4000-8000-000000000001',v_item_id,now()) then
    raise exception 'BILKONTROLLCHEF mandate unexpectedly rejected';
  end if;
  if not public.actor_can_decide_garage_sista_hyran_v1('10000000-0000-4000-8000-000000000007',v_item_id,now()) then
    raise exception 'VD mandate unexpectedly rejected';
  end if;
  if not public.actor_can_decide_garage_sista_hyran_v1('10000000-0000-4000-8000-000000000008',v_item_id,now()) then
    raise exception 'STATIONSCHEF own-station mandate unexpectedly rejected';
  end if;
  if public.actor_can_decide_garage_sista_hyran_v1('10000000-0000-4000-8000-000000000009',v_item_id,now()) then
    raise exception 'STATIONSCHEF other-station mandate unexpectedly passed';
  end if;
  if public.actor_can_decide_garage_sista_hyran_v1('10000000-0000-4000-8000-000000000010',v_item_id,now()) then
    raise exception 'STATIONSCHEF ALL scope bypassed own-station boundary';
  end if;
  if public.actor_can_decide_garage_sista_hyran_v1('10000000-0000-4000-8000-000000000002',v_item_id,now()) then
    raise exception 'ACCESS_GARAGE incorrectly became decision mandate';
  end if;
  if public.actor_can_decide_garage_sista_hyran_v1('10000000-0000-4000-8000-000000000003',v_item_id,now()) then
    raise exception 'BILKONTROLL incorrectly satisfied decision function';
  end if;
  if public.actor_can_decide_garage_sista_hyran_v1('10000000-0000-4000-8000-000000000004',v_item_id,now()) then
    raise exception 'missing mandate unexpectedly passed';
  end if;
end;
$$;

-- DB-boundary: application service role may read but may not fabricate decision/audit rows.
do $$
begin
  if has_table_privilege('service_role','public.garage_sista_hyran_decisions','INSERT') then
    raise exception 'service_role still has direct INSERT on SISTA HYRAN decisions';
  end if;
  if has_table_privilege('service_role','public.garage_salu_operational_events','INSERT') then
    raise exception 'service_role still has direct INSERT on Garage SALU audit';
  end if;
end;
$$;
SQL

# Actual direct fabricated SISTA HYRAN write as service_role must fail at the table boundary.
if "${PSQL[@]}" <<'SQL'
set role service_role;
insert into public.garage_sista_hyran_decisions(
  garage_item_id,salu_plan_id,source_salu_flag_id,regnr,decision_status,decision_version,
  last_rental_at,decision_note,decided_at,decided_by_employee_id,decided_by_auth_user_id,idempotency_key
)
select g.garage_item_id,p.plan_id,g.source_salu_flag_id,p.regnr,'SISTA HYRAN',99,
       now(),'fabricated',now(),'10000000-0000-4000-8000-000000000001',
       '91000000-0000-4000-8000-000000000099','fabricated-direct-insert'
from public.garage_items g
join public.salu_plans p on p.flag_id=g.source_salu_flag_id
where g.source_kind='SALU_PLANERING'
limit 1;
SQL
then
  echo 'direct fabricated SISTA HYRAN INSERT unexpectedly succeeded' >&2
  exit 1
else
  echo 'direct fabricated SISTA HYRAN INSERT REJECT PASS'
fi

# Audit history likewise cannot be fabricated directly by the application role.
if "${PSQL[@]}" <<'SQL'
set role service_role;
insert into public.garage_salu_operational_events(
  garage_item_id,salu_plan_id,source_salu_flag_id,field_name,old_value,new_value,changed_by
)
select g.garage_item_id,p.plan_id,g.source_salu_flag_id,'salu_operational_note',null,'"fabricated"'::jsonb,
       '91000000-0000-4000-8000-000000000099'
from public.garage_items g
join public.salu_plans p on p.flag_id=g.source_salu_flag_id
where g.source_kind='SALU_PLANERING'
limit 1;
SQL
then
  echo 'direct fabricated audit INSERT unexpectedly succeeded' >&2
  exit 1
else
  echo 'direct fabricated audit INSERT REJECT PASS'
fi

"${PSQL[@]}" <<'SQL'
-- Swedish business-time contract: same intended 16:00 survives as 16:00 locally in summer and winter.
do $$
declare
  v_summer timestamptz;
  v_winter timestamptz;
begin
  v_summer := public.swedish_local_datetime_to_timestamptz_v1('2026-06-15T16:00');
  v_winter := public.swedish_local_datetime_to_timestamptz_v1('2026-12-15T16:00');

  if v_summer <> '2026-06-15 14:00:00+00'::timestamptz then
    raise exception 'Swedish summer conversion wrong: %', v_summer;
  end if;
  if v_winter <> '2026-12-15 15:00:00+00'::timestamptz then
    raise exception 'Swedish winter conversion wrong: %', v_winter;
  end if;
  if (v_summer at time zone 'Europe/Stockholm') <> timestamp '2026-06-15 16:00:00' then
    raise exception 'summer round-trip did not preserve 16:00';
  end if;
  if (v_winter at time zone 'Europe/Stockholm') <> timestamp '2026-12-15 16:00:00' then
    raise exception 'winter round-trip did not preserve 16:00';
  end if;

  begin
    perform public.swedish_local_datetime_to_timestamptz_v1('2026-03-29T02:30');
    raise exception 'non-existent DST local time unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.swedish_local_datetime_to_timestamptz_v1('2026-10-25T02:30');
    raise exception 'ambiguous DST local time unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Negative write-path authorization tests.
do $$
declare v_item_id uuid;
begin
  select garage_item_id into v_item_id from public.garage_items
  where source_kind='SALU_PLANERING' and source_salu_flag_id='11111111-1111-4111-8111-111111111111';

  begin
    perform public.decide_garage_sista_hyran_v1(v_item_id,'access@example.com','91000000-0000-4000-8000-000000000002',null,'access only','deny-access');
    raise exception 'ACCESS_GARAGE unexpectedly authorized SISTA HYRAN';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.decide_garage_sista_hyran_v1(v_item_id,'bilkontroll@example.com','91000000-0000-4000-8000-000000000003',null,'wrong function','deny-function');
    raise exception 'BILKONTROLL unexpectedly authorized SISTA HYRAN';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.decide_garage_sista_hyran_v1(v_item_id,'none@example.com','91000000-0000-4000-8000-000000000004',null,'no mandate','deny-none');
    raise exception 'missing mandate unexpectedly authorized SISTA HYRAN';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.decide_garage_sista_hyran_v1(v_item_id,'station-other@example.com','91000000-0000-4000-8000-000000000009',null,'wrong station','deny-station');
    raise exception 'STATIONSCHEF other-station unexpectedly authorized SISTA HYRAN';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.decide_garage_sista_hyran_v1(v_item_id,'auth-only@example.com','10000000-0000-4000-8000-000000000001',null,'auth uuid only','deny-auth-only');
    raise exception 'auth UUID without employee resolution unexpectedly authorized SISTA HYRAN';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.decide_garage_sista_hyran_v1(v_item_id,'duplicate@example.com','91000000-0000-4000-8000-000000000006',null,'ambiguous','deny-ambiguous');
    raise exception 'ambiguous employee unexpectedly authorized SISTA HYRAN';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Explicit authorized decision, retry idempotency, version history and timezone round-trip.
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
    '2026-10-14T16:00','Första explicita beslutet','decision-1'
  );
  if coalesce((v_first->>'sistaHyran')::boolean,false) is not true
     or coalesce((v_first->>'idempotentReplay')::boolean,true) is not false then
    raise exception 'first SISTA HYRAN decision result invalid: %', v_first;
  end if;

  v_retry := public.decide_garage_sista_hyran_v1(
    v_item_id,'chief@example.com','91000000-0000-4000-8000-000000000001',
    '2026-10-14T16:00','Första explicita beslutet','decision-1'
  );
  if coalesce((v_retry->>'idempotentReplay')::boolean,false) is not true then
    raise exception 'retry did not report idempotent replay: %', v_retry;
  end if;

  select count(*) into v_count from public.garage_sista_hyran_decisions where garage_item_id=v_item_id;
  if v_count <> 1 then raise exception 'retry fabricated duplicate decision, count %', v_count; end if;

  -- Prove VD and own-station Stationschef on the actual write boundary using separate versions.
  perform public.decide_garage_sista_hyran_v1(
    v_item_id,'vd@example.com','91000000-0000-4000-8000-000000000007',
    '2026-11-14T16:00','VD authorized','decision-vd'
  );
  perform public.decide_garage_sista_hyran_v1(
    v_item_id,'station-own@example.com','91000000-0000-4000-8000-000000000008',
    '2026-12-14T16:00','Stationschef own authorized','decision-station-own'
  );

  v_second := public.decide_garage_sista_hyran_v1(
    v_item_id,'chief@example.com','91000000-0000-4000-8000-000000000001',
    '2026-12-15T16:00','Slutlig verifieringsversion','decision-final'
  );

  select count(*) into v_count from public.garage_sista_hyran_decisions where garage_item_id=v_item_id;
  if v_count <> 4 then raise exception 'version history count wrong, got %', v_count; end if;

  if not exists (
    select 1 from public.garage_sista_hyran_decisions newer
    join public.garage_sista_hyran_decisions older on older.decision_id=newer.supersedes_decision_id
    where newer.garage_item_id=v_item_id and newer.decision_version=4 and older.decision_version=3
  ) then raise exception 'latest SISTA HYRAN version did not supersede preserved previous version'; end if;

  select decision_version,last_rental_at into v_current_version,v_current_timing
  from public.garage_sista_hyran_current where garage_item_id=v_item_id;
  if v_current_version <> 4
     or v_current_timing <> '2026-12-15 15:00:00+00'::timestamptz
     or (v_current_timing at time zone 'Europe/Stockholm') <> timestamp '2026-12-15 16:00:00' then
    raise exception 'Step 3 read contract/timezone round-trip wrong: version %, timing %', v_current_version,v_current_timing;
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

select 'BILKONTROLLCHEF mandate PASS' as result;
select 'VD mandate PASS' as result;
select 'STATIONSCHEF own-station PASS' as result;
select 'STATIONSCHEF other-station REJECT PASS' as result;
select 'ACCESS_GARAGE-only REJECT PASS' as result;
select 'BILKONTROLL-only REJECT PASS' as result;
select 'missing/ambiguous employee REJECT PASS' as result;
select 'Swedish timezone round-trip PASS' as result;
select 'SALU V2 Step 2 PostgreSQL acceptance PASS' as result;
SQL
