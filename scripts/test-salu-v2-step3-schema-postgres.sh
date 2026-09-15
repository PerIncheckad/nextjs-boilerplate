#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 -X)

# This phase assumes the Step 2 PostgreSQL acceptance has just rebuilt the exact Step 2 fixture.
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
do $$
begin
  if to_regclass('public.garage_sista_incheckningar') is null then
    raise exception 'Step 3 final Check-in table missing';
  end if;
  if to_regclass('public.garage_sista_incheckning_conflicts') is null then
    raise exception 'Step 3 conflict table missing';
  end if;
  if to_regclass('public.garage_sista_incheckning_current') is null then
    raise exception 'Step 3 current view missing';
  end if;
  if to_regprocedure('public.arm_garage_sista_incheckning_intent_v1(uuid,uuid,uuid)') is null then
    raise exception 'Step 3 arm RPC missing';
  end if;
  if to_regprocedure('public.verify_garage_sista_incheckning_from_checkin_v1()') is null then
    raise exception 'Step 3 Check-in verification trigger function missing';
  end if;
end;
$$;

select 'SALU V2 Step 3 schema/migration PASS' as result;
SQL
