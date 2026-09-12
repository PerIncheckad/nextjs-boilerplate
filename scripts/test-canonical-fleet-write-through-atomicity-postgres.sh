#!/usr/bin/env bash
set -euo pipefail

ROOT="${PGDATABASE:-postgres}"
DB="cfm_write_through_atomicity"
BASE=(psql -X -v ON_ERROR_STOP=1 -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}")
P=("${BASE[@]}" -d "$DB")

"${BASE[@]}" -d "$ROOT" <<'SQL' >/dev/null
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
SQL
"${BASE[@]}" -d "$ROOT" -c "drop database if exists $DB with (force)" >/dev/null
"${BASE[@]}" -d "$ROOT" -c "create database $DB" >/dev/null

"${P[@]}" -f migrations/20260911235900_create_canonical_fleet_membership_v1_foundation.sql >/dev/null
"${P[@]}" -f migrations/20260912003000_create_canonical_fleet_membership_v1_bootstrap_foundation.sql >/dev/null
"${P[@]}" -f migrations/20260912003100_harden_canonical_fleet_bootstrap_denominator.sql >/dev/null

"${P[@]}" <<'SQL' >/dev/null
create table public.garage_items (
  garage_item_id uuid primary key, regnr text, vin text, garage_direction text,
  voided_at timestamptz, handed_off_nybil_id uuid, handed_off_at timestamptz,
  updated_at timestamptz not null default now(), completed_at timestamptz,
  completed_by uuid, completion_event_id uuid, updated_by uuid
);
create table public.nybil_inventering (
  id uuid primary key, created_at timestamptz not null default now(), regnr text not null,
  vin text, source_garage_item_id uuid, registrerad_av text, fullstandigt_namn text
);
create table public.garage_avveckla_cases (
  avveckla_case_id uuid primary key, garage_item_id uuid not null, regnr text not null,
  status text not null default 'OPEN', completed_at timestamptz, completed_by uuid,
  completion_event_id uuid, updated_at timestamptz not null default now()
);
create table public.garage_avveckla_events (
  event_id uuid primary key default gen_random_uuid(), avveckla_case_id uuid not null,
  garage_item_id uuid not null, regnr text not null, event_type text not null,
  event_key text not null, occurred_at timestamptz not null, actor_id uuid not null,
  actor_email text, actor_source text not null default 'MANUELL', evidence_reference text,
  payload jsonb not null default '{}'::jsonb
);
create table public.vehicle_journey_periods (
  period_id uuid primary key, regnr text not null, started_at timestamptz not null,
  ended_at timestamptz, updated_at timestamptz not null default now()
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
  raise exception 'FORCED_DOWNSTREAM_TERMINAL_FAILURE';
end $$;
create or replace function public.sync_nybil_garage_handoff()
returns trigger language plpgsql set search_path=public as $$ begin return new; end $$;
create trigger nybil_garage_handoff_sync after insert on public.nybil_inventering
for each row when (new.source_garage_item_id is not null) execute function public.sync_nybil_garage_handoff();
SQL

"${P[@]}" -f migrations/20260912030000_add_canonical_fleet_membership_write_through_v1.sql >/dev/null

"${P[@]}" <<'SQL'
begin;
do $$
declare
  actor uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
  v_identity_id uuid; active_fact uuid;
begin
  v_identity_id:=public.create_fleet_vehicle_identity('ATM001','VIN-ATM-001','2026-09-12 06:00+00','TEST','IDENTITY','atm',null,'{}');
  active_fact:=public.append_fleet_membership_fact(v_identity_id,'ACTIVE','ENTRY','2026-09-12 06:00+00','TEST','ENTRY','atm','atm-entry',null,'SYSTEM',null,null,'{}','{}',null);
  insert into public.garage_items(garage_item_id,regnr,vin,garage_direction) values(g,'ATM001','VIN-ATM-001','UT');
  insert into public.garage_avveckla_cases(avveckla_case_id,garage_item_id,regnr) values(c,g,'ATM001');
  insert into public.vehicle_journey_periods(period_id,regnr,started_at) values(p,'ATM001','2026-09-12 06:05+00');

  begin
    perform public.complete_garage_avveckla_ut_internal(g,'UT_OVERLAMNING_VERIFIERAD','2026-09-12 06:30+00','evidence://atomicity',actor,'actor@example.invalid');
    raise exception 'forced downstream failure did not abort terminal transaction';
  exception when others then
    if sqlerrm='forced downstream failure did not abort terminal transaction' or position('FORCED_DOWNSTREAM_TERMINAL_FAILURE' in sqlerrm)=0 then raise; end if;
  end;

  if exists(select 1 from public.garage_avveckla_events where garage_item_id=g) then raise exception 'terminal event survived downstream rollback'; end if;
  if exists(select 1 from public.fleet_membership_facts f where f.identity_id=v_identity_id and f.basis='EXIT') then raise exception 'membership EXIT survived downstream rollback'; end if;
  if (select count(*) from public.fleet_membership_facts f where f.identity_id=v_identity_id)<>1 then raise exception 'canonical history changed after downstream rollback'; end if;
  if (select status from public.garage_avveckla_cases where avveckla_case_id=c)<>'OPEN' then raise exception 'case completed despite rollback'; end if;
  if (select completed_at from public.garage_items where garage_item_id=g) is not null then raise exception 'Garage completed despite rollback'; end if;
  if (select ended_at from public.vehicle_journey_periods where period_id=p) is not null then raise exception 'Layer 1 period closed despite rollback'; end if;
end $$;
rollback;
SQL

if [[ "$("${P[@]}" -Atc "select count(*) from public.fleet_membership_facts")" != "0" ]]; then
  echo "atomicity rollback left membership data" >&2; exit 1
fi

echo "Canonical Fleet Membership V1 Step 3 downstream atomicity: PASS"
