#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 -X)

# Step 3 is additive to the exact Step 1 + Step 2 contracts.
bash scripts/test-salu-v2-step2-postgres.sh

"${PSQL[@]}" <<'SQL'
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  regnr text not null,
  status text not null,
  completed_at timestamptz,
  completed_by uuid,
  checker_name text,
  checker_email text
);
SQL

"${PSQL[@]}" -f migrations/20260915233000_salu_v2_step3_sista_incheckning.sql
"${PSQL[@]}" -f migrations/20260915233100_salu_v2_step3_exact_binding_hardening.sql

"${PSQL[@]}" <<'SQL'
-- Application service role may read Step 3 evidence but cannot fabricate it.
do $$
begin
  if has_table_privilege('service_role','public.garage_sista_incheckningar','INSERT') then
    raise exception 'service_role can fabricate SISTA INCHECKNING';
  end if;
  if has_table_privilege('service_role','public.garage_sista_incheckning_conflicts','INSERT') then
    raise exception 'service_role can fabricate SISTA INCHECKNING conflicts';
  end if;
  if not has_function_privilege('service_role','public.arm_garage_sista_incheckning_intent_v1(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'service_role cannot arm exact Step 3 provenance';
  end if;
end;
$$;

-- Ordinary completed Check-in without an exact armed SISTA HYRAN chain is unaffected.
insert into public.checkins(id,regnr,status,completed_at,completed_by,checker_name,checker_email)
values (
  '30000000-0000-4000-8000-000000000001','ORD123','COMPLETED',clock_timestamp(),
  '91000000-0000-4000-8000-000000000001','Ordinary Operator','ordinary@example.com'
);

do $$ declare v_count integer;
begin
  select count(*) into v_count from public.garage_sista_incheckningar;
  if v_count <> 0 then raise exception 'ordinary Check-in created SISTA INCHECKNING'; end if;
end $$;

-- A historical completed Check-in before the explicit decision is never retroactively selected.
do $$
declare
  v_item uuid;
  v_decision public.garage_sista_hyran_decisions%rowtype;
begin
  select garage_item_id into v_item
  from public.garage_items
  where source_kind='SALU_PLANERING'
    and source_salu_flag_id='11111111-1111-4111-8111-111111111111';

  select * into v_decision from public.garage_sista_hyran_current where garage_item_id=v_item;

  insert into public.checkins(id,regnr,status,completed_at,completed_by,checker_name,checker_email)
  values (
    '30000000-0000-4000-8000-000000000002',v_decision.regnr,'COMPLETED',
    v_decision.decided_at - interval '1 minute','91000000-0000-4000-8000-000000000001',
    'Chief','chief@example.com'
  );
end;
$$;

do $$ declare v_count integer;
begin
  select count(*) into v_count from public.garage_sista_incheckningar;
  if v_count <> 0 then raise exception 'historical Check-in was retroactively bound'; end if;
end $$;

-- Arm the exact current decision/version for the authenticated Check-in operator.
do $$
declare
  v_item uuid;
  v_decision uuid;
  v_result jsonb;
begin
  select g.garage_item_id,d.decision_id into v_item,v_decision
  from public.garage_items g
  join public.garage_sista_hyran_current d on d.garage_item_id=g.garage_item_id
  where g.source_kind='SALU_PLANERING'
    and g.source_salu_flag_id='11111111-1111-4111-8111-111111111111';

  v_result := public.arm_garage_sista_incheckning_intent_v1(
    v_item,v_decision,'91000000-0000-4000-8000-000000000001'
  );
  if coalesce((v_result->>'armed')::boolean,false) is not true
     or coalesce((v_result->>'alreadyVerified')::boolean,true) is not false then
    raise exception 'exact final Check-in intent was not armed: %',v_result;
  end if;
end;
$$;

-- Normal source-owned Check-in completion now locks exactly that decision/version.
do $$
declare
  v_reg text;
  v_decided_at timestamptz;
begin
  select regnr,decided_at into v_reg,v_decided_at
  from public.garage_sista_hyran_current
  where garage_item_id=(
    select garage_item_id from public.garage_items
    where source_kind='SALU_PLANERING'
      and source_salu_flag_id='11111111-1111-4111-8111-111111111111'
  );

  insert into public.checkins(id,regnr,status,completed_at,completed_by,checker_name,checker_email)
  values (
    '30000000-0000-4000-8000-000000000003',v_reg,'COMPLETED',
    greatest(clock_timestamp(),v_decided_at + interval '1 second'),
    '91000000-0000-4000-8000-000000000001','Chief','chief@example.com'
  );
end;
$$;

do $$
declare
  v_item uuid;
  v_final public.garage_sista_incheckningar%rowtype;
  v_current public.garage_sista_hyran_decisions%rowtype;
  v_count integer;
begin
  select garage_item_id into v_item from public.garage_items
  where source_kind='SALU_PLANERING'
    and source_salu_flag_id='11111111-1111-4111-8111-111111111111';
  select * into v_final from public.garage_sista_incheckningar where garage_item_id=v_item;
  select * into v_current from public.garage_sista_hyran_current where garage_item_id=v_item;

  if v_final.checkin_id <> '30000000-0000-4000-8000-000000000003'::uuid then
    raise exception 'wrong Check-in was frozen: %',v_final.checkin_id;
  end if;
  if v_final.decision_id is distinct from v_current.decision_id
     or v_final.decision_version is distinct from v_current.decision_version then
    raise exception 'final Check-in was not bound to exact current SISTA HYRAN';
  end if;
  if v_final.final_checkin_completed_at is null
     or v_final.checkin_completed_by <> '91000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Check-in completion provenance was not frozen';
  end if;

  select count(*) into v_count from public.garage_sista_incheckningar where garage_item_id=v_item;
  if v_count <> 1 then raise exception 'expected exactly one locked SISTA INCHECKNING, got %',v_count; end if;
end;
$$;

-- Replay/update of the same source Check-in cannot duplicate the lock.
update public.checkins
set checker_name='Chief'
where id='30000000-0000-4000-8000-000000000003';

do $$ declare v_count integer;
begin
  select count(*) into v_count from public.garage_sista_incheckningar;
  if v_count <> 1 then raise exception 'Check-in replay duplicated SISTA INCHECKNING'; end if;
end $$;

-- After final verification a new decision version is permanently rejected, while exact
-- Step 2 idempotency replay of the already-existing decision remains harmless.
do $$
declare
  v_item uuid;
  v_replay jsonb;
begin
  select garage_item_id into v_item from public.garage_items
  where source_kind='SALU_PLANERING'
    and source_salu_flag_id='11111111-1111-4111-8111-111111111111';

  v_replay := public.decide_garage_sista_hyran_v1(
    v_item,'chief@example.com','91000000-0000-4000-8000-000000000001',
    '2026-12-15T16:00','Slutlig verifieringsversion','decision-final'
  );
  if coalesce((v_replay->>'idempotentReplay')::boolean,false) is not true then
    raise exception 'existing decision idempotency replay stopped working';
  end if;

  begin
    perform public.decide_garage_sista_hyran_v1(
      v_item,'chief@example.com','91000000-0000-4000-8000-000000000001',
      '2026-12-16T16:00','Forbidden later version','decision-after-final'
    );
    raise exception 'new SISTA HYRAN version unexpectedly passed after final Check-in';
  exception when raise_exception then
    if sqlerrm='new SISTA HYRAN version unexpectedly passed after final Check-in' then raise; end if;
  end;
end;
$$;

-- A later completed Check-in can only be classified after re-arming the exact locked chain.
do $$
declare
  v_item uuid;
  v_decision uuid;
  v_reg text;
  v_result jsonb;
begin
  select g.garage_item_id,d.decision_id,d.regnr into v_item,v_decision,v_reg
  from public.garage_items g
  join public.garage_sista_hyran_current d on d.garage_item_id=g.garage_item_id
  where g.source_kind='SALU_PLANERING'
    and g.source_salu_flag_id='11111111-1111-4111-8111-111111111111';

  v_result := public.arm_garage_sista_incheckning_intent_v1(
    v_item,v_decision,'91000000-0000-4000-8000-000000000001'
  );
  if coalesce((v_result->>'alreadyVerified')::boolean,false) is not true then
    raise exception 'locked chain was not explicitly re-armed as already verified';
  end if;

  insert into public.checkins(id,regnr,status,completed_at,completed_by,checker_name,checker_email)
  values (
    '30000000-0000-4000-8000-000000000004',v_reg,'COMPLETED',clock_timestamp() + interval '1 second',
    '91000000-0000-4000-8000-000000000001','Chief','chief@example.com'
  );
end;
$$;

do $$
declare
  v_item uuid;
  v_locked_checkin uuid;
  v_final_count integer;
  v_conflict_count integer;
  v_decision_count integer;
begin
  select garage_item_id into v_item from public.garage_items
  where source_kind='SALU_PLANERING'
    and source_salu_flag_id='11111111-1111-4111-8111-111111111111';

  select checkin_id into v_locked_checkin from public.garage_sista_incheckningar where garage_item_id=v_item;
  if v_locked_checkin <> '30000000-0000-4000-8000-000000000003'::uuid then
    raise exception 'later Check-in overwrote locked SISTA INCHECKNING';
  end if;

  select count(*) into v_final_count from public.garage_sista_incheckningar where garage_item_id=v_item;
  select count(*) into v_conflict_count from public.garage_sista_incheckning_conflicts
  where garage_item_id=v_item and conflicting_checkin_id='30000000-0000-4000-8000-000000000004';
  select count(*) into v_decision_count from public.garage_sista_hyran_decisions where garage_item_id=v_item;

  if v_final_count <> 1 then raise exception 'final lock count changed: %',v_final_count; end if;
  if v_conflict_count <> 1 then raise exception 'later Check-in did not create exact-chain conflict: %',v_conflict_count; end if;
  if v_decision_count <> 4 then raise exception 'SISTA HYRAN history changed after final Check-in: %',v_decision_count; end if;

  if exists (select 1 from public.garage_items where garage_item_id=v_item and completed_at is not null) then
    raise exception 'Step 3 closed Garage object';
  end if;
  if exists (select 1 from public.salu_plans where flag_id='11111111-1111-4111-8111-111111111111' and status <> 'PLANERAD') then
    raise exception 'Step 3 rewrote SALU plan state';
  end if;
end;
$$;

select 'ordinary Check-in unaffected PASS' as result;
select 'exact decision/version binding PASS' as result;
select 'historical/early Check-in rejected PASS' as result;
select 'retry idempotency PASS' as result;
select 'later Check-in conflict without overwrite PASS' as result;
select 'new SISTA HYRAN version after final Check-in REJECT PASS' as result;
select 'Garage remains open PASS' as result;
select 'SALU V2 Step 3 PostgreSQL acceptance PASS' as result;
SQL
