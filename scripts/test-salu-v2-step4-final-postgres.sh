#!/usr/bin/env bash
set -euo pipefail

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Execute the existing behavioral acceptance against the complete Step 4 migration
# stack in exact repository order. Inject one additional behavioral proof at the
# point where handoff revision 1 exists but no terminal event has committed yet.
awk '
  /-- Prove downstream failure rolls back terminal event \+ canonical EXIT atomically\./ {
    print "-- Explicit revision-supersession acceptance: rev1 -> source change -> stale terminal REJECT -> new PASS -> rev2 same case -> terminal may proceed."
    print "do $$ declare v_final public.garage_sista_incheckningar%rowtype; begin"
    print "  select * into v_final from public.garage_sista_incheckningar order by verified_at limit 1;"
    print "  insert into public.damages(id,regnr,source,damage_date,damage_type_raw) values"
    print "    (\04781000000-0000-4000-8000-000000000003\047,v_final.regnr,\047BUHS\047,\0472026-01-03\047,\047BUHS C\047);"
    print "end $$;"
    print ""
    print "do $$ declare v_item uuid; begin"
    print "  select garage_item_id into v_item from public.garage_salu_v2_avveckla_handoffs where handoff_revision=1;"
    print "  begin"
    print "    perform public.verify_salu_v2_avveckla_avstallning_v1(v_item,clock_timestamp(),\047stale revision must reject\047,\04791000000-0000-4000-8000-000000000001\047,\047chief@example.com\047);"
    print "    raise exception \047stale handoff terminalization passed\047;"
    print "  exception when raise_exception then"
    print "    if sqlerrm=\047stale handoff terminalization passed\047 then raise; end if;"
    print "  end;"
    print "end $$;"
    print ""
    print "do $$ declare v_final uuid; v_verify jsonb; begin"
    print "  select sista_incheckning_id into v_final from public.garage_sista_incheckningar order by verified_at limit 1;"
    print "  v_verify:=public.verify_salu_v2_buhs_v1(v_final,array["
    print "    \04781000000-0000-4000-8000-000000000001\047::uuid,"
    print "    \04781000000-0000-4000-8000-000000000002\047::uuid,"
    print "    \04781000000-0000-4000-8000-000000000003\047::uuid],"
    print "    \047three-pass\047,\047chief@example.com\047,\04791000000-0000-4000-8000-000000000001\047);"
    print "  if (v_verify->>\047source_row_count\047)::int<>3 or v_verify->>\047total_result\047<>\047PASS\047 then"
    print "    raise exception \047replacement BUHS PASS failed: %\047,v_verify;"
    print "  end if;"
    print "end $$;"
    print ""
    print "do $$ declare v_final uuid; v_buhs uuid; v_old record; v_new jsonb; v_new_row record; begin"
    print "  select sista_incheckning_id into v_final from public.garage_sista_incheckningar order by verified_at limit 1;"
    print "  select salu_v2_handoff_id,avveckla_case_id into v_old"
    print "    from public.garage_salu_v2_avveckla_handoffs where sista_incheckning_id=v_final and handoff_revision=1;"
    print "  select buhs_verification_id into v_buhs from public.salu_v2_buhs_verifications"
    print "    where sista_incheckning_id=v_final order by revision_no desc limit 1;"
    print "  v_new:=public.start_salu_v2_avveckla_v1(v_final,v_buhs,\04791000000-0000-4000-8000-000000000001\047,\047chief@example.com\047);"
    print "  select salu_v2_handoff_id,avveckla_case_id,handoff_revision,supersedes_handoff_id into v_new_row"
    print "    from public.garage_salu_v2_avveckla_handoffs where salu_v2_handoff_id=(v_new->>\047salu_v2_handoff_id\047)::uuid;"
    print "  if v_new_row.handoff_revision<>2 then raise exception \047replacement handoff is not revision 2\047; end if;"
    print "  if v_new_row.supersedes_handoff_id is distinct from v_old.salu_v2_handoff_id then raise exception \047revision 1 was not superseded\047; end if;"
    print "  if v_new_row.avveckla_case_id is distinct from v_old.avveckla_case_id then raise exception \047revision changed avveckla_case_id\047; end if;"
    print "  if (select count(*) from public.garage_salu_v2_avveckla_handoffs where sista_incheckning_id=v_final)<>2 then raise exception \047expected exactly two handoff revisions\047; end if;"
    print "end $$;"
    print ""
    print "select \047revision supersession behavioral PASS\047 as result;"
  }
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
