#!/usr/bin/env bash
set -euo pipefail

ROOT="${PGDATABASE:-postgres}"
BASE=(psql -X -v ON_ERROR_STOP=1 -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}")
M1="migrations/20260911235900_create_canonical_fleet_membership_v1_foundation.sql"
M2="migrations/20260912003000_create_canonical_fleet_membership_v1_bootstrap_foundation.sql"
M3="migrations/20260912003100_harden_canonical_fleet_bootstrap_denominator.sql"
M4="migrations/20260912030000_add_canonical_fleet_membership_write_through_v1.sql"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

"${BASE[@]}" -d "$ROOT" <<'SQL' >/dev/null
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
SQL

cat > "$TMP/source_fixture.sql" <<'SQL'
create table public.garage_items (
  garage_item_id uuid primary key default gen_random_uuid(), regnr text, vin text,
  garage_direction text, voided_at timestamptz, handed_off_nybil_id uuid,
  handed_off_at timestamptz, updated_at timestamptz not null default now(),
  completed_at timestamptz, completed_by uuid, completion_event_id uuid, updated_by uuid
);
create table public.nybil_inventering (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  regnr text not null, vin text, source_garage_item_id uuid, registrerad_av text, fullstandigt_namn text
);
create table public.garage_avveckla_cases (
  avveckla_case_id uuid primary key default gen_random_uuid(), garage_item_id uuid not null,
  regnr text not null, status text not null default 'OPEN', completed_at timestamptz,
  completed_by uuid, completion_event_id uuid, updated_at timestamptz not null default now()
);
create table public.garage_avveckla_events (
  event_id uuid primary key default gen_random_uuid(), avveckla_case_id uuid not null,
  garage_item_id uuid not null, regnr text not null, event_type text not null,
  event_key text not null, occurred_at timestamptz not null, actor_id uuid not null,
  actor_email text, actor_source text not null default 'MANUELL', evidence_reference text,
  payload jsonb not null default '{}'::jsonb
);
create table public.vehicle_journey_periods (
  period_id uuid primary key default gen_random_uuid(), regnr text not null,
  started_at timestamptz not null, ended_at timestamptz, updated_at timestamptz not null default now()
);

create or replace function public.assert_garage_avveckla_ready_for_completion(p_garage_item_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v uuid; begin
  select avveckla_case_id into v from public.garage_avveckla_cases
  where garage_item_id=p_garage_item_id and status='OPEN' for update;
  if v is null then raise exception 'not ready'; end if; return v;
end $$;

create or replace function public.close_vehicle_journey_period_from_source(
  p_period_id uuid,p_regnr text,p_ended_at timestamptz,p_source_system text,
  p_source_entity text,p_source_record_id text,p_actor_id uuid,p_actor_source text,p_actor_email text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.vehicle_journey_periods set ended_at=p_ended_at,updated_at=now()
  where period_id=p_period_id and regnr=p_regnr and ended_at is null;
  if not found then raise exception 'period close failed'; end if;
  return jsonb_build_object('period_id',p_period_id,'ended_at',p_ended_at);
end $$;

-- Production already has this trigger. Step 3 replaces the function, not the trigger.
create or replace function public.sync_nybil_garage_handoff()
returns trigger language plpgsql set search_path=public as $$ begin return new; end $$;
create trigger nybil_garage_handoff_sync after insert on public.nybil_inventering
for each row when (new.source_garage_item_id is not null)
execute function public.sync_nybil_garage_handoff();
SQL

setup_db() {
  local db="$1"
  "${BASE[@]}" -d "$ROOT" -c "drop database if exists $db with (force)" >/dev/null
  "${BASE[@]}" -d "$ROOT" -c "create database $db" >/dev/null
  local p=("${BASE[@]}" -d "$db")
  "${p[@]}" -f "$M1" >/dev/null
  "${p[@]}" -f "$M2" >/dev/null
  "${p[@]}" -f "$M3" >/dev/null
  "${p[@]}" -f "$TMP/source_fixture.sql" >/dev/null
  "${p[@]}" -f "$M4" >/dev/null
}

# ---------------------------------------------------------------------------
# Core rollback acceptance
# ---------------------------------------------------------------------------
CORE=cfm_write_through_core
setup_db "$CORE"
P=("${BASE[@]}" -d "$CORE")
"${P[@]}" <<'SQL'
begin;
do $$
declare
  actor uuid := gen_random_uuid(); r record;
  g1 uuid := gen_random_uuid(); n1 uuid := gen_random_uuid(); identity1 uuid; f1 uuid; f2 uuid;
  g2 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); e2 uuid; x1 uuid; x2 uuid; identity2 uuid;
  g3 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid(); identity3 uuid; active3 uuid; e3 uuid; exit3 uuid;
  fake_event uuid := gen_random_uuid();
  gf uuid := gen_random_uuid(); nf uuid := gen_random_uuid(); identityf uuid;
  t0i uuid; t0b uuid; t0h text;
  gp uuid := gen_random_uuid(); cp uuid := gen_random_uuid(); pp uuid := gen_random_uuid();
begin
  -- Initial Nybil ENTRY through exact source row + exact Garage IN handoff.
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction) values(g1,'NWT001','VIN-NWT-001','IN');
  insert into public.nybil_inventering(id,created_at,regnr,vin,source_garage_item_id,registrerad_av,fullstandigt_namn)
  values(n1,'2026-09-12 03:00+00','NWT001','VIN-NWT-001',g1,'test@example.invalid','Test User');
  select identity_id into identity1 from public.fleet_vehicle_identity_aliases where alias_type='VIN' and alias_value='VIN-NWT-001';
  select fact_id into f1 from public.fleet_membership_facts where source_system='NYBIL' and source_entity='nybil_inventering' and source_event_id=n1::text;
  if f1 is null then raise exception 'initial Nybil ENTRY missing'; end if;
  select * into r from public.fleet_membership_current_by_identity where identity_id=identity1;
  if r.membership_state<>'ACTIVE' or r.basis<>'ENTRY' then raise exception 'initial Nybil ENTRY state invalid'; end if;
  if (select handed_off_nybil_id from public.garage_items where garage_item_id=g1)<>n1 then raise exception 'Garage->Nybil handoff missing'; end if;
  f2:=public.append_fleet_membership_entry_from_nybil(n1);
  if f2<>f1 then raise exception 'Nybil retry not idempotent'; end if;

  -- Pre-T0 initial EXIT: no fabricated ACTIVE/ENTRY.
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction) values(g2,'NWT002','VIN-NWT-002','UT');
  insert into public.garage_avveckla_cases(avveckla_case_id,garage_item_id,regnr) values(c2,g2,'NWT002');
  insert into public.vehicle_journey_periods(period_id,regnr,started_at) values(p2,'NWT002','2026-09-12 01:00+00');
  select (public.complete_garage_avveckla_ut_internal(g2,'UT_OVERLAMNING_VERIFIERAD','2026-09-12 03:10+00','evidence://pre-t0',actor,'actor@example.invalid')->>'completion_event_id')::uuid into e2;
  select fact_id into x1 from public.fleet_membership_facts where source_system='GARAGE_AVVECKLA' and source_event_id=e2::text;
  if x1 is null then raise exception 'pre-T0 initial EXIT missing'; end if;
  select identity_id into identity2 from public.fleet_vehicle_identity_aliases where alias_type='VIN' and alias_value='VIN-NWT-002';
  if exists(select 1 from public.fleet_membership_facts where identity_id=identity2 and basis='ENTRY') then raise exception 'initial EXIT fabricated ENTRY'; end if;
  select * into r from public.fleet_membership_current_by_identity where identity_id=identity2;
  if r.membership_state<>'INACTIVE' or r.basis<>'EXIT' then raise exception 'initial EXIT state invalid'; end if;
  x2:=public.append_fleet_membership_exit_from_avveckla(e2);
  if x2<>x1 then raise exception 'AVVECKLA retry not idempotent'; end if;

  -- ACTIVE -> EXIT normal canonical transition.
  identity3:=public.create_fleet_vehicle_identity('NWT003','VIN-NWT-003','2026-09-12 02:00+00','TEST','IDENTITY','a3',null,'{}');
  active3:=public.append_fleet_membership_fact(identity3,'ACTIVE','ENTRY','2026-09-12 02:00+00','TEST','ENTRY','a3','a3',null,'SYSTEM',null,null,'{}','{}',null);
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction) values(g3,'NWT003','VIN-NWT-003','UT');
  insert into public.garage_avveckla_cases(avveckla_case_id,garage_item_id,regnr) values(c3,g3,'NWT003');
  insert into public.vehicle_journey_periods(period_id,regnr,started_at) values(p3,'NWT003','2026-09-12 02:10+00');
  select (public.complete_garage_avveckla_ut_internal(g3,'UT_TRANSPORTOR_HAMTAT_VERIFIERAD','2026-09-12 03:15+00','evidence://active-exit',actor,'actor@example.invalid')->>'completion_event_id')::uuid into e3;
  select fact_id into exit3 from public.fleet_membership_facts where source_system='GARAGE_AVVECKLA' and source_event_id=e3::text;
  if not exists(select 1 from public.fleet_membership_fact_predecessors where fact_id=exit3 and predecessor_fact_id=active3) then raise exception 'ACTIVE->EXIT predecessor missing'; end if;

  -- False source cannot invoke initial EXIT path.
  insert into public.garage_avveckla_events(event_id,avveckla_case_id,garage_item_id,regnr,event_type,event_key,occurred_at,actor_id,evidence_reference)
  values(fake_event,c2,g2,'NWT002','EVIDENCE_ADDED','fake','2026-09-12 03:16+00',actor,'fake');
  begin
    perform public.append_fleet_membership_exit_from_avveckla(fake_event); raise exception 'fake source passed';
  exception when others then
    if sqlerrm='fake source passed' or position('INITIAL_EXIT_SOURCE_REJECT' in sqlerrm)=0 then raise; end if;
  end;

  -- Nybil atomic rollback: force ACTIVE->ACTIVE rejection after source insert and Garage update.
  identityf:=public.create_fleet_vehicle_identity('NWT004','VIN-NWT-004','2026-09-12 02:00+00','TEST','IDENTITY','f',null,'{}');
  perform public.append_fleet_membership_fact(identityf,'ACTIVE','ENTRY','2026-09-12 02:00+00','TEST','PREACTIVE','f','pre-f',null,'SYSTEM',null,null,'{}','{}',null);
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction) values(gf,'NWT004','VIN-NWT-004','IN');
  begin
    insert into public.nybil_inventering(id,created_at,regnr,vin,source_garage_item_id) values(nf,'2026-09-12 03:20+00','NWT004','VIN-NWT-004',gf);
    raise exception 'ACTIVE->ACTIVE Nybil passed';
  exception when others then if sqlerrm='ACTIVE->ACTIVE Nybil passed' then raise; end if; end;
  if exists(select 1 from public.nybil_inventering where id=nf) then raise exception 'failed Nybil row remained'; end if;
  if (select handed_off_nybil_id from public.garage_items where garage_item_id=gf) is not null then raise exception 'failed Garage handoff remained'; end if;
  if exists(select 1 from public.fleet_membership_facts where source_system='NYBIL' and source_event_id=nf::text) then raise exception 'failed Nybil membership remained'; end if;

  -- Complete T0 becomes live.
  t0i:=public.create_fleet_vehicle_identity('NWT005','VIN-NWT-005','2026-09-12 03:00+00','TEST','IDENTITY','t0',null,'{}');
  t0b:=public.create_fleet_membership_bootstrap_batch('STEP3-T0',1,'2026-09-12 03:30+00','COMPLETE_ACTIVE_POPULATION','TEST','BOOTSTRAP','t0',null,'{}');
  perform public.add_fleet_membership_bootstrap_item(t0b,'NWT005',t0i,'ACTIVE','RESOLVED','NWT005','VIN-NWT-005','TEST','ROW','Bilkontroll Test','2026-09-12 03:30+00','t0-item',null,null,'{}');
  t0h:=public.seal_fleet_membership_bootstrap_batch(t0b,'Bilkontroll Test','2026-09-12 03:31+00',null,'Denna population är komplett för OWN_FLEET ACTIVE vid T0.','{}');
  perform public.apply_fleet_membership_bootstrap_batch(t0b,t0h,'Bilkontroll Test','2026-09-12 03:32+00',null);
  if not (select bootstrap_denominator_eligible from public.fleet_membership_bootstrap_batch_status where batch_id=t0b) then raise exception 'T0 not live'; end if;

  -- Post-T0 NO_FACT EXIT rejects and rolls back the terminal source and all side effects.
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction) values(gp,'NWT006','VIN-NWT-006','UT');
  insert into public.garage_avveckla_cases(avveckla_case_id,garage_item_id,regnr) values(cp,gp,'NWT006');
  insert into public.vehicle_journey_periods(period_id,regnr,started_at) values(pp,'NWT006','2026-09-12 03:00+00');
  begin
    perform public.complete_garage_avveckla_ut_internal(gp,'UT_AVSTALLNING_VERIFIERAD','2026-09-12 03:40+00','evidence://post-t0',actor,'actor@example.invalid');
    raise exception 'post-T0 NO_FACT EXIT passed';
  exception when others then
    if sqlerrm='post-T0 NO_FACT EXIT passed' or position('POST_T0_NO_FACT_EXIT_REJECT' in sqlerrm)=0 then raise; end if;
  end;
  if exists(select 1 from public.garage_avveckla_events where garage_item_id=gp) then raise exception 'failed AVVECKLA event remained'; end if;
  if (select ended_at from public.vehicle_journey_periods where period_id=pp) is not null then raise exception 'failed AVVECKLA closed period'; end if;
  if (select status from public.garage_avveckla_cases where avveckla_case_id=cp)<>'OPEN' then raise exception 'failed AVVECKLA completed case'; end if;
  if (select completed_at from public.garage_items where garage_item_id=gp) is not null then raise exception 'failed AVVECKLA completed Garage'; end if;
  if exists(select 1 from public.fleet_vehicle_identity_aliases where alias_type='VIN' and alias_value='VIN-NWT-006') then raise exception 'failed AVVECKLA left identity'; end if;
end $$;

do $$ begin
  if has_function_privilege('service_role','public.lock_fleet_membership_cutover()','EXECUTE') then raise exception 'cutover lock exposed'; end if;
  if has_function_privilege('service_role','public.append_fleet_membership_entry_from_nybil(uuid)','EXECUTE') then raise exception 'Nybil adapter exposed'; end if;
  if has_function_privilege('service_role','public.append_fleet_membership_exit_from_avveckla(uuid)','EXECUTE') then raise exception 'AVVECKLA adapter exposed'; end if;
end $$;
rollback;
SQL

if [[ "$("${P[@]}" -Atc "select count(*) from public.fleet_membership_facts")" != "0" ]]; then
  echo "rollback acceptance left membership facts" >&2; exit 1
fi

# ---------------------------------------------------------------------------
# Real parallel ordering 1: source-event owns cutover lock before T0.
# ---------------------------------------------------------------------------
SF=cfm_write_through_source_first
setup_db "$SF"
SFP=("${BASE[@]}" -d "$SF")
IFS='|' read -r sf_identity sf_garage sf_ny sf_batch sf_hash <<< "$("${SFP[@]}" -At -F '|' <<'SQL'
with ids as (
  select public.create_fleet_vehicle_identity('ORD001','VIN-ORD-001','2026-09-12 04:00+00','TEST','IDENTITY','ord1',null,'{}') identity_id,
         gen_random_uuid() garage_id, gen_random_uuid() ny_id
), g as (
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction) select garage_id,'ORD001','VIN-ORD-001','IN' from ids returning garage_item_id
), b as (
  select public.create_fleet_membership_bootstrap_batch('ORDER-SOURCE-FIRST',1,'2026-09-12 04:10+00','COMPLETE_ACTIVE_POPULATION','TEST','BOOTSTRAP','osf',null,'{}') batch_id
), i as (
  select public.add_fleet_membership_bootstrap_item(b.batch_id,'ORD001',ids.identity_id,'ACTIVE','RESOLVED','ORD001','VIN-ORD-001','TEST','ROW','Bilkontroll Test','2026-09-12 04:10+00','osf-item',null,null,'{}') from b,ids
), s as (
  select b.batch_id,public.seal_fleet_membership_bootstrap_batch(b.batch_id,'Bilkontroll Test','2026-09-12 04:11+00',null,'Denna population är komplett för OWN_FLEET ACTIVE vid T0.','{}') h from b,i
)
select ids.identity_id,ids.garage_id,ids.ny_id,s.batch_id,s.h from ids,s;
SQL
)"

"${SFP[@]}" -v garage="$sf_garage" -v ny="$sf_ny" >"$TMP/sf_a.out" 2>"$TMP/sf_a.err" <<'SQL' &
begin;
select public.lock_fleet_membership_cutover();
insert into public.nybil_inventering(id,created_at,regnr,vin,source_garage_item_id) values(:'ny','2026-09-12 04:05+00','ORD001','VIN-ORD-001',:'garage');
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
create temp table acceptance_vars(identity_id uuid,batch_id uuid);
insert into acceptance_vars values(:'identity',:'batch');
do $$ declare r record; v_identity uuid; v_batch uuid; begin
  select identity_id,batch_id into v_identity,v_batch from acceptance_vars;
  select * into r from public.fleet_membership_current_by_identity where identity_id=v_identity;
  if r.membership_state<>'ACTIVE' or r.basis<>'ENTRY' then raise exception 'source-first state invalid'; end if;
  if (select count(*) from public.fleet_membership_facts where identity_id=v_identity)<>1 then raise exception 'source-first T0 duplicated fact'; end if;
  if not exists(select 1 from public.fleet_membership_bootstrap_item_applications x join public.fleet_membership_bootstrap_applications a on a.application_id=x.application_id where a.batch_id=v_batch and x.outcome='CANONICAL_STATE_CONFIRMED' and x.canonical_basis='ENTRY') then raise exception 'source-first confirmation missing'; end if;
end $$;
SQL

# ---------------------------------------------------------------------------
# Real parallel ordering 2: T0 owns cutover lock before source-event.
# ---------------------------------------------------------------------------
TF=cfm_write_through_t0_first
setup_db "$TF"
TFP=("${BASE[@]}" -d "$TF")
IFS='|' read -r tf_identity tf_garage tf_ny tf_batch tf_hash <<< "$("${TFP[@]}" -At -F '|' <<'SQL'
with ids as (
  select public.create_fleet_vehicle_identity('ORD002','VIN-ORD-002','2026-09-12 05:00+00','TEST','IDENTITY','ord2',null,'{}') identity_id,
         gen_random_uuid() garage_id,gen_random_uuid() ny_id
), g as (
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction) select garage_id,'ORD002','VIN-ORD-002','IN' from ids returning garage_item_id
), b as (
  select public.create_fleet_membership_bootstrap_batch('ORDER-T0-FIRST',1,'2026-09-12 05:05+00','COMPLETE_ACTIVE_POPULATION','TEST','BOOTSTRAP','otf',null,'{}') batch_id
), i as (
  select public.add_fleet_membership_bootstrap_item(b.batch_id,'ORD002',ids.identity_id,'INACTIVE','RESOLVED','ORD002','VIN-ORD-002','TEST','ROW','Bilkontroll Test','2026-09-12 05:05+00','otf-item',null,null,'{}') from b,ids
), s as (
  select b.batch_id,public.seal_fleet_membership_bootstrap_batch(b.batch_id,'Bilkontroll Test','2026-09-12 05:06+00',null,'Denna population är komplett för OWN_FLEET ACTIVE vid T0.','{}') h from b,i
)
select ids.identity_id,ids.garage_id,ids.ny_id,s.batch_id,s.h from ids,s;
SQL
)"

"${TFP[@]}" -v batch="$tf_batch" -v hash="$tf_hash" >"$TMP/tf_a.out" 2>"$TMP/tf_a.err" <<'SQL' &
begin;
select public.apply_fleet_membership_bootstrap_batch(:'batch',:'hash','Bilkontroll Test','2026-09-12 05:07+00',null);
select pg_sleep(2);
commit;
SQL
pid_a=$!
sleep 0.25
"${TFP[@]}" -v garage="$tf_garage" -v ny="$tf_ny" >"$TMP/tf_b.out" 2>"$TMP/tf_b.err" <<'SQL' &
insert into public.nybil_inventering(id,created_at,regnr,vin,source_garage_item_id) values(:'ny','2026-09-12 05:10+00','ORD002','VIN-ORD-002',:'garage');
SQL
pid_b=$!
wait "$pid_a"; wait "$pid_b"

"${TFP[@]}" -v identity="$tf_identity" <<'SQL'
create temp table acceptance_vars(identity_id uuid);
insert into acceptance_vars values(:'identity');
do $$ declare r record; v_identity uuid; begin
  select identity_id into v_identity from acceptance_vars;
  select * into r from public.fleet_membership_current_by_identity where identity_id=v_identity;
  if r.membership_state<>'ACTIVE' or r.basis<>'ENTRY' then raise exception 'T0-first state invalid'; end if;
  if (select count(*) from public.fleet_membership_facts where identity_id=v_identity)<>2 then raise exception 'T0-first chain cardinality invalid'; end if;
  if not exists(
    select 1 from public.fleet_membership_facts f
    join public.fleet_membership_fact_predecessors p on p.fact_id=f.fact_id
    join public.fleet_membership_facts prev on prev.fact_id=p.predecessor_fact_id
    where f.identity_id=v_identity and f.basis='ENTRY' and f.membership_state='ACTIVE'
      and prev.basis='CURRENT_BASELINE' and prev.membership_state='INACTIVE'
  ) then raise exception 'T0-first canonical predecessor transition missing'; end if;
end $$;
SQL

echo "Canonical Fleet Membership V1 Step 3 PostgreSQL acceptance: PASS"
