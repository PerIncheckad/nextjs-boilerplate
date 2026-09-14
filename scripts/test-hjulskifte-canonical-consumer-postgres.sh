#!/usr/bin/env bash
set -euo pipefail

ROOT="${PGDATABASE:-postgres}"
DB="hjulskifte_canonical_acceptance"
BASE_PSQL=(psql -X -v ON_ERROR_STOP=1 -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}")
PSQL=("${BASE_PSQL[@]}" -d "$DB")
MIGRATION="migrations/20260914193000_hjulskifte_canonical_fleet_consumer.sql"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

"${BASE_PSQL[@]}" -d "$ROOT" <<'SQL' >/dev/null
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
SQL

"${BASE_PSQL[@]}" -d "$ROOT" -c "drop database if exists $DB with (force)" >/dev/null
"${BASE_PSQL[@]}" -d "$ROOT" -c "create database $DB" >/dev/null

"${PSQL[@]}" <<'SQL' >/dev/null
create table public.fleet_membership_bootstrap_batch_status (
  batch_id uuid primary key,
  t0 timestamptz not null,
  scope text not null,
  coverage_mode text not null,
  verified boolean not null,
  complete_active_population_attested boolean not null,
  application_id uuid,
  bootstrap_denominator_eligible boolean not null,
  unresolved_count bigint not null
);
create table public.fleet_vehicle_identities (identity_id uuid primary key, identity_scope text not null);
create table public.fleet_membership_current_by_identity (
  identity_id uuid primary key,
  membership_state text not null,
  resolution_reason text not null
);
create table public.fleet_vehicle_identity_aliases (
  alias_id uuid primary key,
  identity_id uuid not null,
  alias_type text not null,
  alias_value text not null
);
create table public.checkins (
  id uuid primary key,
  regnr text,
  completed_at timestamptz,
  status text,
  current_city text,
  city text,
  current_station text,
  station text
);
create table public.nybil_inventering (
  id uuid primary key,
  regnr text,
  plats_aktuell_ort text,
  plats_aktuell_station text,
  created_at timestamptz not null
);
create table public.salu_vehicle_state (regnr text primary key, current_saludatum date);
create table public.test_wheel_facts (regnr text primary key, wheel_type text, verified_at timestamptz);
create table public.wheel_change_scope_campaigns (season_key text primary key, status text);
create table public.wheel_change_season_scope (season_key text, regnr text, scope_status text);

create function public.get_current_wheel_fact(p_regnr text)
returns table(regnr text, wheel_type text, verified_at timestamptz, source_system text, source_entity text, source_record_id text)
language sql
as $$
  select f.regnr, f.wheel_type, f.verified_at, 'TEST'::text, 'test_wheel_facts'::text, f.regnr
  from public.test_wheel_facts f
  where f.regnr = upper(regexp_replace(coalesce(p_regnr,''), '\s+', '', 'g'));
$$;

insert into public.fleet_membership_bootstrap_batch_status values
('00000000-0000-4000-8000-000000000001','2026-09-14 12:57+00','OWN_FLEET','COMPLETE_ACTIVE_POPULATION',true,true,'00000000-0000-4000-8000-000000000002',true,0);

insert into public.fleet_vehicle_identities values
('10000000-0000-4000-8000-000000000001','OWN_FLEET'),
('10000000-0000-4000-8000-000000000002','OWN_FLEET'),
('10000000-0000-4000-8000-000000000003','OWN_FLEET'),
('10000000-0000-4000-8000-000000000004','OWN_FLEET');
insert into public.fleet_membership_current_by_identity values
('10000000-0000-4000-8000-000000000001','ACTIVE','RESOLVED'),
('10000000-0000-4000-8000-000000000002','ACTIVE','RESOLVED'),
('10000000-0000-4000-8000-000000000003','INACTIVE','RESOLVED'),
('10000000-0000-4000-8000-000000000004','ACTIVE','RESOLVED');
insert into public.fleet_vehicle_identity_aliases values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','REGNR','CAN001'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','REGNR','CAN002'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','REGNR','OLD001'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','REGNR','AMB001'),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004','REGNR','AMB002');

insert into public.checkins values
('30000000-0000-4000-8000-000000000001','CAN001','2026-09-10 10:00+00','COMPLETED','Malmö',null,'Malmö',null),
('30000000-0000-4000-8000-000000000002','HIST01','2026-09-10 10:00+00','COMPLETED','Lund',null,'Lund',null);
insert into public.nybil_inventering values
('40000000-0000-4000-8000-000000000001','HIST02','Helsingborg','Helsingborg','2026-09-11 10:00+00');
insert into public.test_wheel_facts values ('CAN001','Sommardäck','2026-09-10 10:00+00');
insert into public.salu_vehicle_state values ('CAN001','2027-02-01');
insert into public.wheel_change_scope_campaigns values ('WINTER_2026','ACTIVE');
insert into public.wheel_change_season_scope values ('WINTER_2026','OLD_SCOPE','IN_SCOPE');
SQL

sed '1{/^begin;$/d;}; ${/^commit;$/d;}' "$MIGRATION" > "$TMP/migration.sql"
"${PSQL[@]}" -f "$TMP/migration.sql" >/dev/null

"${PSQL[@]}" <<'SQL'
do $$
declare
  n bigint;
  r record;
begin
  select count(*) into n from public.get_wheel_change_candidate_source();
  if n <> 2 then raise exception 'expected 2 unambiguous canonical ACTIVE candidates, got %', n; end if;

  if exists (select 1 from public.get_wheel_change_candidate_source() where regnr in ('HIST01','HIST02','OLD001','AMB001','AMB002')) then
    raise exception 'historical, inactive or ambiguous identity leaked into candidate denominator';
  end if;

  select * into r from public.get_wheel_change_candidate_source() where regnr='CAN001';
  if r.current_wheel_type <> 'Sommardäck' or r.current_city <> 'Malmö' or r.current_saludatum <> date '2027-02-01' then
    raise exception 'wheel truth/enrichment contract changed';
  end if;

  if (select count(*) from public.wheel_change_season_scope where regnr='OLD_SCOPE') <> 1 then
    raise exception 'historical campaign evidence was rewritten';
  end if;

  update public.fleet_membership_bootstrap_batch_status set unresolved_count=1;
  select count(*) into n from public.get_wheel_change_candidate_source();
  if n <> 0 then raise exception 'bootstrap health failure did not fail closed'; end if;

  update public.fleet_membership_bootstrap_batch_status set unresolved_count=0, verified=false;
  select count(*) into n from public.get_wheel_change_candidate_source();
  if n <> 0 then raise exception 'unverified bootstrap did not fail closed'; end if;
end $$;
SQL

echo "Hjulskifte canonical fleet consumer PostgreSQL acceptance: PASS"
