#!/usr/bin/env bash
set -euo pipefail

ROOT="${PGDATABASE:-postgres}"
BASE_PSQL=(psql -X -v ON_ERROR_STOP=1 -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}")
M1="migrations/20260911235900_create_canonical_fleet_membership_v1_foundation.sql"
M2="migrations/20260912003000_create_canonical_fleet_membership_v1_bootstrap_foundation.sql"
M3="migrations/20260912003100_harden_canonical_fleet_bootstrap_denominator.sql"
M4="migrations/20260912030000_add_canonical_fleet_membership_write_through_v1.sql"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

"${BASE_PSQL[@]}" -d "$ROOT" <<'SQL' >/dev/null
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
SQL

cat > "$TMP/source_fixture.sql" <<'SQL'
create table public.garage_items (
  garage_item_id uuid primary key default gen_random_uuid(),
  regnr text,
  vin text,
  garage_direction text,
  voided_at timestamptz,
  handed_off_nybil_id uuid,
  handed_off_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid,
  completion_event_id uuid,
  updated_by uuid
);

create table public.nybil_inventering (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  regnr text not null,
  vin text,
  source_garage_item_id uuid,
  registrerad_av text,
  fullstandigt_namn text
);

create table public.garage_avveckla_cases (
  avveckla_case_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null,
  regnr text not null,
  status text not null default 'OPEN',
  completed_at timestamptz,
  completed_by uuid,
  completion_event_id uuid,
  updated_at timestamptz not null default now()
);

create table public.garage_avveckla_events (
  event_id uuid primary key default gen_random_uuid(),
  avveckla_case_id uuid not null,
  garage_item_id uuid not null,
  regnr text not null,
  event_type text not null,
  event_key text not null,
  occurred_at timestamptz not null,
  actor_id uuid not null,
  actor_email text,
  actor_source text not null default 'MANUELL',
  evidence_reference text,
  payload jsonb not null default '{}'::jsonb
);

create table public.vehicle_journey_periods (
  period_id uuid primary key default gen_random_uuid(),
  regnr text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.assert_garage_avveckla_ready_for_completion(p_garage_item_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  select avveckla_case_id into v_id from public.garage_avveckla_cases
  where garage_item_id=p_garage_item_id and status='OPEN' for update;
  if v_id is null then raise exception 'not ready'; end if;
  return v_id;
end $$;

create or replace function public.close_vehicle_journey_period_from_source(
  p_period_id uuid, p_regnr text, p_ended_at timestamptz,
  p_source_system text, p_source_entity text, p_source_record_id text,
  p_actor_id uuid, p_actor_source text, p_actor_email text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.vehicle_journey_periods
  set ended_at=p_ended_at, updated_at=now()
  where period_id=p_period_id and regnr=p_regnr and ended_at is null;
  if not found then raise exception 'period close failed'; end if;
  return jsonb_build_object('period_id',p_period_id,'ended_at',p_ended_at);
end $$;

-- Existing Production trigger survives the Step 3 function replacement.
create or replace function public.sync_nybil_garage_handoff()
returns trigger language plpgsql set search_path=public as $$ begin return new; end $$;
create trigger nybil_garage_handoff_sync
after insert on public.nybil_inventering
for each row when (new.source_garage_item_id is not null)
execute function public.sync_nybil_garage_handoff();
SQL

setup_db() {
  local db="$1"
  "${BASE_PSQL[@]}" -d "$ROOT" -c "drop database if exists $db with (force)" >/dev/null
  "${BASE_PSQL[@]}" -d "$ROOT" -c "create database $db" >/dev/null
  local p=("${BASE_PSQL[@]}" -d "$db")
  "${p[@]}" -f "$M1" >/dev/null
  "${p[@]}" -f "$M2" >/dev/null
  "${p[@]}" -f "$M3" >/dev/null
  "${p[@]}" -f "$TMP/source_fixture.sql" >/dev/null
  "${p[@]}" -f "$M4" >/dev/null
}

CORE=cfm_write_through_core
setup_db "$CORE"
P=("${BASE_PSQL[@]}" -d "$CORE")

# Full acceptance is rolled back. It proves initial Nybil ENTRY, pre-T0 initial
# EXIT, exact source retries, fake-source rejection, post-T0 NO_FACT rejection,
# and statement-level atomicity across source + membership writes.
"${P[@]}" <<'SQL'
begin;

do $$
declare
  actor uuid := gen_random_uuid();
  gin uuid := gen_random_uuid();
  ny uuid := gen_random_uuid();
  fact1 uuid; fact2 uuid; id1 uuid;
  gout uuid := gen_random_uuid();
  case1 uuid := gen_random_uuid();
  period1 uuid := gen_random_uuid();
  exit_event uuid; exit_fact1 uuid; exit_fact2 uuid;
  fake_event uuid := gen_random_uuid();
  preexit_identity uuid;
  fail_garage uuid := gen_random_uuid();
  fail_ny uuid := gen_random_uuid();
  fail_identity uuid;
  t0_identity uuid;
  t0_batch uuid; t0_hash text;
  post_garage uuid := gen_random_uuid();
  post_case uuid := gen_random_uuid();
  post_period uuid := gen_random_uuid();
  r record;
begin
  -- Initial Nybil ENTRY is created by the existing Garage->Nybil trigger boundary.
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction)
  values(gin,'NWT001','VIN-NWT-001','IN');
  insert into public.nybil_inventering(id,created_at,regnr,vin,source_garage_item_id,registrerad_av,fullstandigt_namn)
  values(ny,'2026-09-12 03:00+00','NWT001','VIN-NWT-001',gin,'test@example.invalid','Test User');

  select identity_id into id1 from public.fleet_vehicle_identity_aliases
  where alias_type='VIN' and alias_value='VIN-NWT-001';
  select fact_id into fact1 from public.fleet_membership_facts
  where source_system='NYBIL' and source_entity='nybil_inventering' and source_event_id=ny::text;
  if fact1 is null then raise exception 'initial Nybil ENTRY missing'; end if;
  select * into r from public.fleet_membership_current_by_identity where identity_id=id1;
  if r.membership_state <> 'ACTIVE' or r.basis <> 'ENTRY' then raise exception 'initial Nybil ENTRY did not produce ACTIVE'; end if;
  if (select handed_off_nybil_id from public.garage_items where garage_item_id=gin) <> ny then raise exception 'Garage handoff missing'; end if;

  fact2 := public.append_fleet_membership_entry_from_nybil(ny);
  if fact2 <> fact1 then raise exception 'Nybil source-event retry was not idempotent'; end if;

  -- Pre-T0 verified terminal AVVECKLA may establish initial EXIT without a fake ACTIVE.
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction)
  values(gout,'NWT002','VIN-NWT-002','UT');
  insert into public.garage_avveckla_cases(avveckla_case_id,garage_item_id,regnr)
  values(case1,gout,'NWT002');
  insert into public.vehicle_journey_periods(period_id,regnr,started_at)
  values(period1,'NWT002','2026-09-12 01:00+00');

  select (public.complete_garage_avveckla_ut_internal(
    gout,'UT_OVERLAMNING_VERIFIERAD','2026-09-12 03:10+00','evidence://pre-t0',actor,'actor@example.invalid'
  )->>'completion_event_id')::uuid into exit_event;
  select fact_id into exit_fact1 from public.fleet_membership_facts
  where source_system='GARAGE_AVVECKLA' and source_entity='garage_avveckla_events' and source_event_id=exit_event::text;
  if exit_fact1 is null then raise exception 'pre-T0 initial EXIT missing'; end if;
  if exists (
    select 1 from public.fleet_membership_facts f
    join public.fleet_vehicle_identity_aliases a on a.identity_id=f.identity_id
    where a.alias_type='VIN' and a.alias_value='VIN-NWT-002' and f.basis='ENTRY'
  ) then raise exception 'pre-T0 EXIT fabricated ENTRY history'; end if;
  select identity_id into preexit_identity from public.fleet_vehicle_identity_aliases where alias_type='VIN' and alias_value='VIN-NWT-002';
  select * into r from public.fleet_membership_current_by_identity where identity_id=preexit_identity;
  if r.membership_state <> 'INACTIVE' or r.basis <> 'EXIT' then raise exception 'initial EXIT did not produce INACTIVE'; end if;
  exit_fact2 := public.append_fleet_membership_exit_from_avveckla(exit_event);
  if exit_fact2 <> exit_fact1 then raise exception 'AVVECKLA source-event retry was not idempotent'; end if;

  -- A non-terminal/fabricated source can never use the initial EXIT exception.
  insert into public.garage_avveckla_events(event_id,avveckla_case_id,garage_item_id,regnr,event_type,event_key,occurred_at,actor_id,evidence_reference)
  values(fake_event,case1,gout,'NWT002','EVIDENCE_ADDED','fake','2026-09-12 03:11+00',actor,'fake');
  begin
    perform public.append_fleet_membership_exit_from_avveckla(fake_event);
    raise exception 'fake initial EXIT source passed';
  exception when others then
    if sqlerrm='fake initial EXIT source passed' or position('INITIAL_EXIT_SOURCE_REJECT' in sqlerrm)=0 then raise; end if;
  end;

  -- Nybil source + Garage handoff + ENTRY are one statement transaction. Force
  -- ACTIVE->ACTIVE to reject and prove source/handoff do not remain half-written.
  fail_identity := public.create_fleet_vehicle_identity('NWT003','VIN-NWT-003','2026-09-12 02:00+00','TEST','IDENTITY','pre',null,'{}');
  perform public.append_fleet_membership_fact(fail_identity,'ACTIVE','ENTRY','2026-09-12 02:00+00','TEST','PREACTIVE','pre','pre-active',null,'SYSTEM',null,null,'{}','{}',null);
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction) values(fail_garage,'NWT003','VIN-NWT-003','IN');
  begin
    insert into public.nybil_inventering(id,created_at,regnr,vin,source_garage_item_id)
    values(fail_ny,'2026-09-12 03:20+00','NWT003','VIN-NWT-003',fail_garage);
    raise exception 'ACTIVE->ACTIVE Nybil unexpectedly passed';
  exception when others then
    if sqlerrm='ACTIVE->ACTIVE Nybil unexpectedly passed' then raise; end if;
  end;
  if exists(select 1 from public.nybil_inventering where id=fail_ny) then raise exception 'failed Nybil source remained written'; end if;
  if (select handed_off_nybil_id from public.garage_items where garage_item_id=fail_garage) is not null then raise exception 'failed Nybil Garage handoff remained written'; end if;
  if exists(select 1 from public.fleet_membership_facts where source_system='NYBIL' and source_event_id=fail_ny::text) then raise exception 'failed Nybil membership remained written'; end if;

  -- Establish a denominator-eligible COMPLETE T0, then prove NO_FACT initial EXIT closes.
  t0_identity := public.create_fleet_vehicle_identity('NWT004','VIN-NWT-004','2026-09-12 02:30+00','TEST','IDENTITY','t0',null,'{}');
  t0_batch := public.create_fleet_membership_bootstrap_batch('STEP3-T0',1,'2026-09-12 03:30+00','COMPLETE_ACTIVE_POPULATION','TEST','BOOTSTRAP','t0',null,'{}');
  perform public.add_fleet_membership_bootstrap_item(t0_batch,'NWT004',t0_identity,'ACTIVE','RESOLVED','NWT004','VIN-NWT-004','TEST','ROW','Bilkontroll Test','2026-09-12 03:30+00','t0-item',null,null,'{}');
  t0_hash := public.seal_fleet_membership_bootstrap_batch(t0_batch,'Bilkontroll Test','2026-09-12 03:31+00',null,'Denna population är komplett för OWN_FLEET ACTIVE vid T0.','{}');
  perform public.apply_fleet_membership_bootstrap_batch(t0_batch,t0_hash,'Bilkontroll Test','2026-09-12 03:32+00',null);
  if not (select bootstrap_denominator_eligible from public.fleet_membership_bootstrap_batch_status where batch_id=t0_batch) then raise exception 'T0 did not become denominator eligible'; end if;

  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction) values(post_garage,'NWT005','VIN-NWT-005','UT');
  insert into public.garage_avveckla_cases(avveckla_case_id,garage_item_id,regnr) values(post_case,post_garage,'NWT005');
  insert into public.vehicle_journey_periods(period_id,regnr,started_at) values(post_period,'NWT005','2026-09-12 03:00+00');
  begin
    perform public.complete_garage_avveckla_ut_internal(post_garage,'UT_AVSTALLNING_VERIFIERAD','2026-09-12 03:40+00','evidence://post-t0',actor,'actor@example.invalid');
    raise exception 'post-T0 NO_FACT EXIT unexpectedly passed';
  exception when others then
    if sqlerrm='post-T0 NO_FACT EXIT unexpectedly passed' or position('POST_T0_NO_FACT_EXIT_REJECT' in sqlerrm)=0 then raise; end if;
  end;
  if exists(select 1 from public.garage_avveckla_events where garage_item_id=post_garage) then raise exception 'failed AVVECKLA terminal source remained written'; end if;
  if (select ended_at from public.vehicle_journey_periods where period_id=post_period) is not null then raise exception 'failed AVVECKLA closed Layer 1 period'; end if;
  if (select status from public.garage_avveckla_cases where avveckla_case_id=post_case) <> 'OPEN' then raise exception 'failed AVVECKLA completed case'; end if;
  if (select completed_at from public.garage_items where garage_item_id=post_garage) is not null then raise exception 'failed AVVECKLA completed Garage item'; end if;
  if exists(select 1 from public.fleet_vehicle_identity_aliases where alias_type='VIN' and alias_value='VIN-NWT-005') then raise exception 'failed AVVECKLA left canonical identity'; end if;
end $$;

-- Internal source adapters/cutover lock are not exposed to service_role.
do $$ begin
  if has_function_privilege('service_role','public.lock_fleet_membership_cutover()','EXECUTE') then raise exception 'service_role can call cutover lock'; end if;
  if has_function_privilege('service_role','public.append_fleet_membership_entry_from_nybil(uuid)','EXECUTE') then raise exception 'service_role can call internal Nybil adapter'; end if;
  if has_function_privilege('service_role','public.append_fleet_membership_exit_from_avveckla(uuid)','EXECUTE') then raise exception 'service_role can call internal AVVECKLA adapter'; end if;
end $$;

rollback;

select case when count(*)=0 then 1 else 0 end from public.fleet_membership_facts \gset
\if :case
\else
  \quit 1
\endif
SQL

# Real concurrency acceptance: source-event holds the cutover lock first; T0
# blocks, then confirms the committed modern state without creating a baseline.
SF=cfm_write_through_source_first
setup_db "$SF"
SFP=("${BASE_PSQL[@]}" -d "$SF")
read -r sf_identity sf_garage sf_ny sf_batch sf_hash < <("${SFP[@]}" -At <<'SQL'
with ids as (
  select public.create_fleet_vehicle_identity('ORD001','VIN-ORD-001','2026-09-12 04:00+00','TEST','IDENTITY','ord1',null,'{}') identity_id,
         gen_random_uuid() garage_id, gen_random_uuid() ny_id
), g as (
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction)
  select garage_id,'ORD001','VIN-ORD-001','IN' from ids returning garage_item_id
), b as (
  select public.create_fleet_membership_bootstrap_batch('ORDER-SOURCE-FIRST',1,'2026-09-12 04:10+00','COMPLETE_ACTIVE_POPULATION','TEST','BOOTSTRAP','osf',null,'{}') batch_id
), i as (
  select public.add_fleet_membership_bootstrap_item(b.batch_id,'ORD001',ids.identity_id,'ACTIVE','RESOLVED','ORD001','VIN-ORD-001','TEST','ROW','Bilkontroll Test','2026-09-12 04:10+00','osf-item',null,null,'{}')
  from b,ids
), s as (
  select b.batch_id, public.seal_fleet_membership_bootstrap_batch(b.batch_id,'Bilkontroll Test','2026-09-12 04:11+00',null,'Denna population är komplett för OWN_FLEET ACTIVE vid T0.','{}') h from b,i
)
select ids.identity_id,ids.garage_id,ids.ny_id,s.batch_id,s.h from ids,s;
SQL
)

"${SFP[@]}" -v garage="$sf_garage" -v ny="$sf_ny" >"$TMP/sf_a.out" 2>"$TMP/sf_a.err" <<'SQL' &
begin;
select public.lock_fleet_membership_cutover();
insert into public.nybil_inventering(id,created_at,regnr,vin,source_garage_item_id)
values(:'ny','2026-09-12 04:05+00','ORD001','VIN-ORD-001',:'garage');
select pg_sleep(2);
commit;
SQL
pid_a=$!
sleep 0.25
"${SFP[@]}" -v batch="$sf_batch" -v hash="$sf_hash" >"$TMP/sf_b.out" 2>"$TMP/sf_b.err" <<'SQL' &
select public.apply_fleet_membership_bootstrap_batch(:'batch',:'hash','Bilkontroll Test','2026-09-12 04:12+00',null);
SQL
pid_b=$!
wait "$pid_a"; wait "$pid_b"
"${SFP[@]}" -v identity="$sf_identity" -v batch="$sf_batch" <<'SQL'
do $$declare r record; begin
  select * into r from public.fleet_membership_current_by_identity where identity_id=:'identity';
  if r.membership_state <> 'ACTIVE' or r.basis <> 'ENTRY' then raise exception 'source-first final state incorrect'; end if;
  if (select count(*) from public.fleet_membership_facts where identity_id=:'identity') <> 1 then raise exception 'source-first T0 duplicated modern fact'; end if;
  if not exists(
    select 1 from public.fleet_membership_bootstrap_item_applications x
    join public.fleet_membership_bootstrap_applications a on a.application_id=x.application_id
    where a.batch_id=:'batch' and x.outcome='CANONICAL_STATE_CONFIRMED' and x.canonical_basis='ENTRY'
  ) then raise exception 'source-first T0 did not confirm modern state'; end if;
end $$;
SQL

# Reverse concurrency: T0 holds the cutover lock first and writes INACTIVE;
# Nybil waits, then performs the ordinary INACTIVE -> ENTRY ACTIVE transition.
TF=cfm_write_through_t0_first
setup_db "$TF"
TFP=("${BASE_PSQL[@]}" -d "$TF")
read -r tf_identity tf_garage tf_ny tf_batch tf_hash < <("${TFP[@]}" -At <<'SQL'
with ids as (
  select public.create_fleet_vehicle_identity('ORD002','VIN-ORD-002','2026-09-12 05:00+00','TEST','IDENTITY','ord2',null,'{}') identity_id,
         gen_random_uuid() garage_id, gen_random_uuid() ny_id
), g as (
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction)
  select garage_id,'ORD002','VIN-ORD-002','IN' from ids returning garage_item_id
), b as (
  select public.create_fleet_membership_bootstrap_batch('ORDER-T0-FIRST',1,'2026-09-12 05:05+00','COMPLETE_ACTIVE_POPULATION','TEST','BOOTSTRAP','otf',null,'{}') batch_id
), i as (
  select public.add_fleet_membership_bootstrap_item(b.batch_id,'ORD002',ids.identity_id,'INACTIVE','RESOLVED','ORD002','VIN-ORD-002','TEST','ROW','Bilkontroll Test','2026-09-12 05:05+00','otf-item',null,null,'{}')
  from b,ids
), s as (
  select b.batch_id, public.seal_fleet_membership_bootstrap_batch(b.batch_id,'Bilkontroll Test','2026-09-12 05:06+00',null,'Denna population är komplett för OWN_FLEET ACTIVE vid T0.','{}') h from b,i
)
select ids.identity_id,ids.garage_id,ids.ny_id,s.batch_id,s.h from ids,s;
SQL
)

"${TFP[@]}" -v batch="$tf_batch" -v hash="$tf_hash" >"$TMP/tf_a.out" 2>"$TMP/tf_a.err" <<'SQL' &
begin;
select public.apply_fleet_membership_bootstrap_batch(:'batch',:'hash','Bilkontroll Test','2026-09-12 05:07+00',null);
select pg_sleep(2);
commit;
SQL
pid_a=$!
sleep 0.25
"${TFP[@]}" -v garage="$tf_garage" -v ny="$tf_ny" >"$TMP/tf_b.out" 2>"$TMP/tf_b.err" <<'SQL' &
insert into public.nybil_inventering(id,created_at,regnr,vin,source_garage_item_id)
values(:'ny','2026-09-12 05:10+00','ORD002','VIN-ORD-002',:'garage');
SQL
pid_b=$!
wait "$pid_a"; wait "$pid_b"
"${TFP[@]}" -v identity="$tf_identity" <<'SQL'
do $$declare r record; begin
  select * into r from public.fleet_membership_current_by_identity where identity_id=:'identity';
  if r.membership_state <> 'ACTIVE' or r.basis <> 'ENTRY' then raise exception 'T0-first final state incorrect'; end if;
  if (select count(*) from public.fleet_membership_facts where identity_id=:'identity') <> 2 then raise exception 'T0-first expected baseline + ENTRY chain'; end if;
  if not exists(
    select 1 from public.fleet_membership_facts f
    join public.fleet_membership_fact_predecessors p on p.fact_id=f.fact_id
    join public.fleet_membership_facts prev on prev.fact_id=p.predecessor_fact_id
    where f.identity_id=:'identity' and f.basis='ENTRY' and f.membership_state='ACTIVE'
      and prev.basis='CURRENT_BASELINE' and prev.membership_state='INACTIVE'
  ) then raise exception 'T0-first ordinary predecessor transition missing'; end if;
end $$;
SQL

echo "Canonical Fleet Membership V1 Step 3 PostgreSQL acceptance: PASS"
