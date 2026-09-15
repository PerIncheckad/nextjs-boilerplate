#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 -X)

# Assumes Step 3 base migration acceptance has just passed in the same PostgreSQL service.
"${PSQL[@]}" -f migrations/20260915233100_salu_v2_step3_exact_binding_hardening.sql

"${PSQL[@]}" <<'SQL'
do $$
begin
  if to_regprocedure('public.arm_garage_sista_incheckning_intent_v1(uuid,uuid,uuid)') is null then
    raise exception 'Step 3 hardened arm RPC missing';
  end if;
  if to_regprocedure('public.verify_garage_sista_incheckning_from_checkin_v1()') is null then
    raise exception 'Step 3 hardened verification function missing';
  end if;
end;
$$;

select 'SALU V2 Step 3 exact-binding hardening migration PASS' as result;
SQL
