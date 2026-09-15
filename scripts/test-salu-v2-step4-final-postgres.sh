#!/usr/bin/env bash
set -euo pipefail

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Execute the existing behavioral acceptance unchanged, but against the complete
# Step 4 migration stack in exact repository order. This keeps one authoritative
# behavioral script while ensuring revision/transport hardening is active before
# any Step 4 assertions run.
awk '
  { print }
  /20260916013100_salu_v2_step4_terminal_bridge.sql/ {
    print "\"${PSQL[@]}\" -f migrations/20260916013200_salu_v2_step4_revision_hardening.sql"
    print "\"${PSQL[@]}\" -f migrations/20260916013300_salu_v2_step4_transport_revision_hardening.sql"
  }
' scripts/test-salu-v2-step4-postgres.sh > "$TMP"

bash "$TMP"

psql -v ON_ERROR_STOP=1 -X <<'SQL'
do $$
declare
  v_handoff_cols integer;
  v_terminal_def text;
  v_start_def text;
  v_transport_def text;
begin
  select count(*) into v_handoff_cols
  from information_schema.columns
  where table_schema='public'
    and table_name='garage_salu_v2_avveckla_handoffs'
    and column_name in ('handoff_revision','supersedes_handoff_id');
  if v_handoff_cols<>2 then raise exception 'final Step4 handoff revision schema missing'; end if;

  select pg_get_functiondef('public.complete_salu_v2_avveckla_terminal_v1(uuid,text,timestamptz,text,uuid,text)'::regprocedure) into v_terminal_def;
  select pg_get_functiondef('public.start_salu_v2_avveckla_v1(uuid,uuid,uuid,text)'::regprocedure) into v_start_def;
  select pg_get_functiondef('public.book_salu_v2_avveckla_transport_v1(uuid,timestamptz,text,uuid,text)'::regprocedure) into v_transport_def;

  if position('order by handoff_revision desc' in lower(v_terminal_def))=0 then raise exception 'terminal does not resolve latest handoff revision'; end if;
  if position('supersedes_handoff_id' in lower(v_start_def))=0 then raise exception 'handoff revision supersession is missing'; end if;
  if position('order by handoff_revision desc' in lower(v_transport_def))=0 then raise exception 'transport does not resolve latest handoff revision'; end if;
  if position('durationhours' in lower(v_terminal_def))>0 then raise exception 'SALU terminal contains durationHours'; end if;
end $$;

select 'final Step4 revision hardening PostgreSQL contract PASS' as result;
SQL
