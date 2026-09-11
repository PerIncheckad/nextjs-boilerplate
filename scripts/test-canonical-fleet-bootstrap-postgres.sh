#!/usr/bin/env bash
set -euo pipefail

ROOT="${PGDATABASE:-postgres}"
DB="cfm_bootstrap_acceptance"
BASE_PSQL=(psql -X -v ON_ERROR_STOP=1 -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}")
PSQL=("${BASE_PSQL[@]}" -d "$DB")
M1="migrations/20260911235900_create_canonical_fleet_membership_v1_foundation.sql"
M2="migrations/20260912003000_create_canonical_fleet_membership_v1_bootstrap_foundation.sql"
M3="migrations/20260912003100_harden_canonical_fleet_bootstrap_denominator.sql"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP" /tmp/cfb_*.out /tmp/cfb_*.err' EXIT

"${BASE_PSQL[@]}" -d "$ROOT" <<'SQL' >/dev/null
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
SQL
"${BASE_PSQL[@]}" -d "$ROOT" -c "drop database if exists $DB with (force)" >/dev/null
"${BASE_PSQL[@]}" -d "$ROOT" -c "create database $DB" >/dev/null

strip_tx() { sed '1{/^begin;$/d;}; ${/^commit;$/d;}' "$1"; }
strip_tx "$M1" > "$TMP/m1.sql"
strip_tx "$M2" > "$TMP/m2.sql"
strip_tx "$M3" > "$TMP/m3.sql"

cat > "$TMP/acceptance.sql" <<'SQL'
do $$
declare
  a uuid; i uuid; u uuid; m uuid; c uuid; cu uuid;
  b_partial uuid; b_states uuid; b_modern uuid; b_complete uuid; b_complete_unknown uuid;
  b_h1 uuid; b_h2 uuid;
  item uuid; app1 uuid; app2 uuid; modern_fact uuid;
  h_partial text; h_states text; h_modern text; h_complete text; h_complete_unknown text; h1 text; h2 text;
  r record;
  n bigint;
begin
  a := public.create_fleet_vehicle_identity('BSA001', null, '2026-09-12 00:00+00', 'TEST', 'IDENTITY', 'A', null, '{}'::jsonb);
  i := public.create_fleet_vehicle_identity('BSI001', null, '2026-09-12 00:00+00', 'TEST', 'IDENTITY', 'I', null, '{}'::jsonb);
  u := public.create_fleet_vehicle_identity('BSU001', null, '2026-09-12 00:00+00', 'TEST', 'IDENTITY', 'U', null, '{}'::jsonb);
  m := public.create_fleet_vehicle_identity('BSM001', null, '2026-09-12 00:00+00', 'TEST', 'IDENTITY', 'M', null, '{}'::jsonb);

  -- PARTIAL never becomes a fleet denominator; unresolved rows are explicit and retained.
  b_partial := public.create_fleet_membership_bootstrap_batch('PARTIAL-1',1,'2026-09-12 01:00+00','PARTIAL','TEST','BOOTSTRAP','P1',null,'{"purpose":"partial"}'::jsonb);
  perform public.add_fleet_membership_bootstrap_item(b_partial,'A',a,'ACTIVE','RESOLVED','BSA001',null,'TEST','ROW','Bilkontroll Test','2026-09-12 01:00+00','A',null,null,'{"verified":true}'::jsonb);
  perform public.add_fleet_membership_bootstrap_item(b_partial,'MISSING',null,'UNKNOWN','NO_CANONICAL_IDENTITY','MISS001',null,'TEST','ROW','Bilkontroll Test','2026-09-12 01:00+00','MISS',null,null,'{"searched":true}'::jsonb);
  h_partial := public.seal_fleet_membership_bootstrap_batch(b_partial,'Bilkontroll Test','2026-09-12 01:05+00',null,null,'{"reviewed":true}'::jsonb);
  app1 := public.apply_fleet_membership_bootstrap_batch(b_partial,h_partial,'Bilkontroll Test','2026-09-12 01:06+00',null);
  app2 := public.apply_fleet_membership_bootstrap_batch(b_partial,h_partial,'Bilkontroll Test','2026-09-12 01:07+00',null);
  if app1 <> app2 then raise exception 'same sealed batch/revision was not exactly-once'; end if;
  select * into r from public.fleet_membership_bootstrap_batch_status where batch_id=b_partial;
  if r.bootstrap_denominator_eligible or r.consumer_cutover_ready then raise exception 'PARTIAL became denominator/cutover eligible'; end if;
  if r.unresolved_count <> 1 then raise exception 'unresolved bootstrap object disappeared'; end if;
  if (select count(*) from public.fleet_membership_bootstrap_item_applications where application_id=app1 and outcome='UNRESOLVED') <> 1 then raise exception 'unresolved application outcome missing'; end if;
  select * into r from public.get_fleet_membership('BSA001',null);
  if r.membership_state <> 'ACTIVE' or r.basis <> 'CURRENT_BASELINE' then raise exception 'ACTIVE baseline did not use canonical membership foundation'; end if;
  select * into r from public.get_fleet_membership('MISS001',null);
  if r.membership_state <> 'UNKNOWN' or r.resolution_reason <> 'NO_FACT' then raise exception 'absence was converted into a canonical state'; end if;

  -- Explicit INACTIVE and fact-backed UNKNOWN are written only when verified per vehicle.
  b_states := public.create_fleet_membership_bootstrap_batch('STATES-1',1,'2026-09-12 01:10+00','PARTIAL','TEST','BOOTSTRAP','S1',null,'{}'::jsonb);
  perform public.add_fleet_membership_bootstrap_item(b_states,'I',i,'INACTIVE','RESOLVED','BSI001',null,'TEST','ROW','Bilkontroll Test','2026-09-12 01:10+00','I',null,null,'{"decision":"inactive"}'::jsonb);
  perform public.add_fleet_membership_bootstrap_item(b_states,'U',u,'UNKNOWN','RESOLVED','BSU001',null,'TEST','ROW','Bilkontroll Test','2026-09-12 01:10+00','U',null,null,'{"decision":"unknown"}'::jsonb);
  h_states := public.seal_fleet_membership_bootstrap_batch(b_states,'Bilkontroll Test','2026-09-12 01:11+00',null,null,'{}'::jsonb);
  perform public.apply_fleet_membership_bootstrap_batch(b_states,h_states,'Bilkontroll Test','2026-09-12 01:12+00',null);
  select * into r from public.get_fleet_membership('BSI001',null);
  if r.membership_state <> 'INACTIVE' or r.basis <> 'CURRENT_BASELINE' then raise exception 'explicit INACTIVE baseline failed'; end if;
  select * into r from public.get_fleet_membership('BSU001',null);
  if r.membership_state <> 'UNKNOWN' or r.resolution_reason <> 'RESOLVED' or r.membership_fact_id is null then raise exception 'fact-backed UNKNOWN baseline failed'; end if;
  if exists(select 1 from public.fleet_membership_facts where source_system='CANONICAL_BOOTSTRAP' and basis <> 'CURRENT_BASELINE') then raise exception 'historical/backfill transition created by bootstrap'; end if;

  -- Modern state already present at/before T0 is confirmed, never overwritten by a new baseline.
  modern_fact := public.append_fleet_membership_fact(m,'ACTIVE','ENTRY','2026-09-12 01:15+00','MODERN','NYBIL','M','ENTRY-M',null,'SYSTEM',null,null,'{}'::jsonb,'{}'::uuid[],null);
  b_modern := public.create_fleet_membership_bootstrap_batch('MODERN-1',1,'2026-09-12 01:20+00','PARTIAL','TEST','BOOTSTRAP','M1',null,'{}'::jsonb);
  perform public.add_fleet_membership_bootstrap_item(b_modern,'M',m,'ACTIVE','RESOLVED','BSM001',null,'TEST','ROW','Bilkontroll Test','2026-09-12 01:20+00','M',null,null,'{}'::jsonb);
  h_modern := public.seal_fleet_membership_bootstrap_batch(b_modern,'Bilkontroll Test','2026-09-12 01:21+00',null,null,'{}'::jsonb);
  perform public.apply_fleet_membership_bootstrap_batch(b_modern,h_modern,'Bilkontroll Test','2026-09-12 01:22+00',null);
  if (select count(*) from public.fleet_membership_facts where identity_id=m) <> 1 then raise exception 'bootstrap rewrote/duplicated modern canonical state'; end if;
  if not exists(select 1 from public.fleet_membership_bootstrap_item_applications x join public.fleet_membership_bootstrap_applications a0 on a0.application_id=x.application_id where a0.batch_id=b_modern and x.outcome='CANONICAL_STATE_CONFIRMED' and x.membership_fact_id=modern_fact and x.canonical_basis='ENTRY') then raise exception 'modern state confirmation audit missing'; end if;

  -- COMPLETE requires the exact Bilkontroll attestation.
  c := public.create_fleet_vehicle_identity('BSC001',null,'2026-09-12 01:25+00','TEST','IDENTITY','C',null,'{}'::jsonb);
  b_complete := public.create_fleet_membership_bootstrap_batch('COMPLETE-1',1,'2026-09-12 01:30+00','COMPLETE_ACTIVE_POPULATION','TEST','BOOTSTRAP','C1',null,'{}'::jsonb);
  perform public.add_fleet_membership_bootstrap_item(b_complete,'C',c,'ACTIVE','RESOLVED','BSC001',null,'TEST','ROW','Bilkontroll Test','2026-09-12 01:30+00','C',null,null,'{}'::jsonb);
  begin
    perform public.seal_fleet_membership_bootstrap_batch(b_complete,'Bilkontroll Test','2026-09-12 01:31+00',null,null,'{}'::jsonb);
    raise exception 'COMPLETE sealed without attestation';
  exception when others then if sqlerrm='COMPLETE sealed without attestation' or position('BOOTSTRAP_COMPLETENESS_ATTESTATION_REQUIRED' in sqlerrm)=0 then raise; end if; end;
  h_complete := public.seal_fleet_membership_bootstrap_batch(b_complete,'Bilkontroll Test','2026-09-12 01:31+00',null,'Denna population är komplett för OWN_FLEET ACTIVE vid T0.','{"basis":"manual review"}'::jsonb);
  perform public.apply_fleet_membership_bootstrap_batch(b_complete,h_complete,'Bilkontroll Test','2026-09-12 01:32+00',null);
  select * into r from public.fleet_membership_bootstrap_batch_status where batch_id=b_complete;
  if not r.bootstrap_denominator_eligible or r.consumer_cutover_ready then raise exception 'clean COMPLETE denominator gate failed'; end if;

  -- Even attested COMPLETE is not denominator-eligible while UNKNOWN remains.
  cu := public.create_fleet_vehicle_identity('BSCU01',null,'2026-09-12 01:35+00','TEST','IDENTITY','CU',null,'{}'::jsonb);
  b_complete_unknown := public.create_fleet_membership_bootstrap_batch('COMPLETE-U',1,'2026-09-12 01:40+00','COMPLETE_ACTIVE_POPULATION','TEST','BOOTSTRAP','CU1',null,'{}'::jsonb);
  perform public.add_fleet_membership_bootstrap_item(b_complete_unknown,'CU',cu,'UNKNOWN','RESOLVED','BSCU01',null,'TEST','ROW','Bilkontroll Test','2026-09-12 01:40+00','CU',null,null,'{}'::jsonb);
  h_complete_unknown := public.seal_fleet_membership_bootstrap_batch(b_complete_unknown,'Bilkontroll Test','2026-09-12 01:41+00',null,'Denna population är komplett för OWN_FLEET ACTIVE vid T0.','{}'::jsonb);
  perform public.apply_fleet_membership_bootstrap_batch(b_complete_unknown,h_complete_unknown,'Bilkontroll Test','2026-09-12 01:42+00',null);
  select * into r from public.fleet_membership_bootstrap_batch_status where batch_id=b_complete_unknown;
  if r.bootstrap_denominator_eligible then raise exception 'COMPLETE with UNKNOWN became denominator eligible'; end if;

  -- Manifest/evidence changes produce a different immutable revision/hash.
  b_h1 := public.create_fleet_membership_bootstrap_batch('HASH-CHANGE',1,'2026-09-12 02:00+00','PARTIAL','TEST','BOOTSTRAP','H1',null,'{}'::jsonb);
  perform public.add_fleet_membership_bootstrap_item(b_h1,'H',a,'ACTIVE','RESOLVED','BSA001',null,'TEST','ROW','Bilkontroll Test','2026-09-12 02:00+00','H',null,null,'{"evidence_version":1}'::jsonb);
  h1 := public.seal_fleet_membership_bootstrap_batch(b_h1,'Bilkontroll Test','2026-09-12 02:01+00',null,null,'{}'::jsonb);
  b_h2 := public.create_fleet_membership_bootstrap_batch('HASH-CHANGE',2,'2026-09-12 02:00+00','PARTIAL','TEST','BOOTSTRAP','H2',null,'{}'::jsonb);
  perform public.add_fleet_membership_bootstrap_item(b_h2,'H',a,'ACTIVE','RESOLVED','BSA001',null,'TEST','ROW','Bilkontroll Test','2026-09-12 02:00+00','H',null,null,'{"evidence_version":2}'::jsonb);
  h2 := public.seal_fleet_membership_bootstrap_batch(b_h2,'Bilkontroll Test','2026-09-12 02:01+00',null,null,'{}'::jsonb);
  if h1 = h2 then raise exception 'evidence change did not change revision hash'; end if;
  if (select manifest_hash from public.fleet_membership_bootstrap_seals where batch_id=b_h1) = (select manifest_hash from public.fleet_membership_bootstrap_seals where batch_id=b_h2) then raise exception 'evidence change did not change manifest hash'; end if;

  -- Same batch/revision payload is idempotent; changed payload is conflict.
  if public.create_fleet_membership_bootstrap_batch('HASH-CHANGE',1,'2026-09-12 02:00+00','PARTIAL','TEST','BOOTSTRAP','H1',null,'{}'::jsonb) <> b_h1 then raise exception 'exact batch/revision retry not idempotent'; end if;
  begin
    perform public.create_fleet_membership_bootstrap_batch('HASH-CHANGE',1,'2026-09-12 02:00+00','PARTIAL','TEST','BOOTSTRAP','DIFFERENT',null,'{}'::jsonb);
    raise exception 'changed batch/revision payload unexpectedly passed';
  exception when others then if sqlerrm='changed batch/revision payload unexpectedly passed' or position('BOOTSTRAP_REVISION_CONFLICT' in sqlerrm)=0 then raise; end if; end;

  -- Verified revisions are immutable and cannot gain items.
  begin
    perform public.add_fleet_membership_bootstrap_item(b_h1,'LATE',a,'ACTIVE','RESOLVED','BSA001',null,'TEST','ROW','Bilkontroll Test','2026-09-12 02:02+00','LATE',null,null,'{}'::jsonb);
    raise exception 'sealed batch accepted late item';
  exception when others then if sqlerrm='sealed batch accepted late item' or position('BOOTSTRAP_REVISION_SEALED' in sqlerrm)=0 then raise; end if; end;
  begin update public.fleet_membership_bootstrap_batches set source_record_id='MUTATED' where batch_id=b_h1; raise exception 'direct batch update passed'; exception when others then if sqlerrm='direct batch update passed' then raise; end if; end;
  begin delete from public.fleet_membership_bootstrap_items where batch_id=b_h1; raise exception 'direct item delete passed'; exception when others then if sqlerrm='direct item delete passed' then raise; end if; end;

  -- Wrong revision hash cannot be applied.
  begin perform public.apply_fleet_membership_bootstrap_batch(b_h1,'00000000000000000000000000000000','Bilkontroll Test','2026-09-12 02:03+00',null); raise exception 'wrong revision hash applied'; exception when others then if sqlerrm='wrong revision hash applied' or position('BOOTSTRAP_APPLICATION_CONFLICT' in sqlerrm)=0 then raise; end if; end;

  -- No client role gets direct mutation; only controlled service RPCs are exposed.
  if has_table_privilege('service_role','public.fleet_membership_bootstrap_batches','INSERT')
     or has_table_privilege('service_role','public.fleet_membership_bootstrap_items','UPDATE')
     or has_table_privilege('authenticated','public.fleet_membership_bootstrap_batches','INSERT')
     or has_table_privilege('anon','public.fleet_membership_bootstrap_batches','INSERT') then raise exception 'direct bootstrap mutation grant exists'; end if;
  if has_function_privilege('authenticated','public.create_fleet_membership_bootstrap_batch(text,integer,timestamptz,text,text,text,text,text,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.apply_fleet_membership_bootstrap_batch(uuid,text,text,timestamptz,text)','EXECUTE')
     or has_function_privilege('service_role','public.lock_fleet_bootstrap_batch(uuid)','EXECUTE') then raise exception 'bootstrap RPC boundary leaked'; end if;
  if not has_function_privilege('service_role','public.create_fleet_membership_bootstrap_batch(text,integer,timestamptz,text,text,text,text,text,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.add_fleet_membership_bootstrap_item(uuid,text,uuid,text,text,text,text,text,text,text,timestamptz,text,text,text,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.seal_fleet_membership_bootstrap_batch(uuid,text,timestamptz,text,text,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.apply_fleet_membership_bootstrap_batch(uuid,text,text,timestamptz,text)','EXECUTE') then raise exception 'controlled service bootstrap RPC missing'; end if;

  if exists(select 1 from pg_class c join pg_namespace n0 on n0.oid=c.relnamespace where n0.nspname='public' and c.relname like 'fleet_membership_bootstrap_%' and c.relkind='r' and not c.relrowsecurity) then raise exception 'bootstrap table without RLS'; end if;
end $$;
SQL

# Full exact migration bodies + acceptance in one transaction, then rollback.
{
  echo 'begin;'
  cat "$TMP/m1.sql" "$TMP/m2.sql" "$TMP/m3.sql" "$TMP/acceptance.sql"
  echo 'rollback;'
} > "$TMP/rollback.sql"
"${PSQL[@]}" -f "$TMP/rollback.sql" >/tmp/cfb_rollback.out
if "${PSQL[@]}" -Atc "select to_regclass('public.fleet_membership_bootstrap_batches') is not null" | grep -qx t; then
  echo 'rollback leaked bootstrap schema' >&2; exit 1
fi
echo 'bootstrap rollback acceptance: PASS'

# Persistent disposable DB only: apply exact migrations for real multi-session race acceptance.
"${PSQL[@]}" -f "$M1" >/tmp/cfb_m1.out
"${PSQL[@]}" -f "$M2" >/tmp/cfb_m2.out
"${PSQL[@]}" -f "$M3" >/tmp/cfb_m3.out

ID=$("${PSQL[@]}" -Atc "select public.create_fleet_vehicle_identity('RACEB01',null,'2026-09-12 03:00+00','RACE','IDENTITY','R',null,'{}'::jsonb)")
BATCH=$("${PSQL[@]}" -Atc "select public.create_fleet_membership_bootstrap_batch('RACE-BATCH',1,'2026-09-12 03:10+00','PARTIAL','RACE','BOOTSTRAP','R',null,'{}'::jsonb)")
"${PSQL[@]}" -Atc "select public.add_fleet_membership_bootstrap_item('$BATCH','R','$ID','ACTIVE','RESOLVED','RACEB01',null,'RACE','ROW','Bilkontroll Race','2026-09-12 03:10+00','R',null,null,'{}'::jsonb)" >/dev/null
HASH=$("${PSQL[@]}" -Atc "select public.seal_fleet_membership_bootstrap_batch('$BATCH','Bilkontroll Race','2026-09-12 03:11+00',null,null,'{}'::jsonb)")
SQL_APPLY="select public.apply_fleet_membership_bootstrap_batch('$BATCH','$HASH','Bilkontroll Race','2026-09-12 03:12+00',null);"
"${PSQL[@]}" -Atc "$SQL_APPLY" >/tmp/cfb_apply1.out 2>/tmp/cfb_apply1.err & p1=$!
"${PSQL[@]}" -Atc "$SQL_APPLY" >/tmp/cfb_apply2.out 2>/tmp/cfb_apply2.err & p2=$!
wait "$p1"; wait "$p2"
[[ "$(cat /tmp/cfb_apply1.out)" == "$(cat /tmp/cfb_apply2.out)" ]]
[[ "$("${PSQL[@]}" -Atc "select count(*) from public.fleet_membership_bootstrap_applications where batch_id='$BATCH'")" == "1" ]]
[[ "$("${PSQL[@]}" -Atc "select count(*) from public.fleet_membership_facts where identity_id='$ID' and source_system='CANONICAL_BOOTSTRAP'")" == "1" ]]
echo 'bootstrap concurrent exactly-once apply: PASS'
