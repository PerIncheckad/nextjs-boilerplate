#!/usr/bin/env bash
set -euo pipefail

MIGRATION="migrations/20260911235900_create_canonical_fleet_membership_v1_foundation.sql"
DB="${PGDATABASE:-postgres}"
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -d "$DB")

body="$(mktemp)"
wrapper="$(mktemp)"
cleanup() { rm -f "$body" "$wrapper" /tmp/cfm_*.out /tmp/cfm_*.err; }
trap cleanup EXIT

# Vanilla PostgreSQL lacks Supabase Data API roles. Create test-only role names so
# the exact migration's GRANT/REVOKE contract can execute unchanged.
"${PSQL[@]}" <<'SQL' >/tmp/cfm_roles.out
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
SQL

# Remove only the migration's outer transaction wrapper so the exact body can be
# exercised inside an acceptance transaction that ends in ROLLBACK.
sed '1{/^begin;$/d;}; ${/^commit;$/d;}' "$MIGRATION" > "$body"

cat > "$wrapper" <<'SQL'
begin;
SQL
cat "$body" >> "$wrapper"
cat >> "$wrapper" <<'SQL'

do $$
declare
  a uuid; b uuid; c uuid;
  f0 uuid; f1 uuid; f2 uuid; retry uuid;
  f_branch uuid; f_corr uuid;
  alias_count_before bigint; identity_count_before bigint;
  original_state text; heads uuid[];
  r record;
begin
  select * into r from public.get_fleet_membership('NOF001', null);
  if r.membership_state <> 'UNKNOWN' or r.resolution_reason <> 'NO_FACT' or r.membership_fact_id is not null then raise exception 'NO_FACT acceptance failed'; end if;

  a := public.create_fleet_vehicle_identity('ABC 123', null, '2026-09-11 20:00+00', 'TEST', 'IDENTITY', 'A', null, '{}'::jsonb);
  if public.create_fleet_vehicle_identity('ABC123', null, '2026-09-11 20:01+00', 'TEST', 'IDENTITY', 'A2', null, '{}'::jsonb) <> a then raise exception 'REGNR resolve acceptance failed'; end if;

  begin perform public.create_fleet_vehicle_identity('ABC123', 'WVWZZZ11111111111', '2026-09-11 20:02+00', 'TEST', 'IDENTITY', 'AUTO-BIND', null, '{}'::jsonb); raise exception 'implicit VIN binding unexpectedly passed';
  exception when others then if sqlerrm = 'implicit VIN binding unexpectedly passed' or position('IDENTITY_BINDING_REQUIRED' in sqlerrm) = 0 then raise; end if; end;

  perform public.bind_fleet_vehicle_identity_alias(a, 'VIN', 'WVWZZZ11111111111', '2026-09-11 20:03+00', 'TEST', 'IDENTITY_BINDING', 'BIND-A', null, '{"verified":true}'::jsonb);
  if public.create_fleet_vehicle_identity('ABC123', 'WVWZZZ11111111111', '2026-09-11 20:04+00', 'TEST', 'IDENTITY', 'RESOLVE-A', null, '{}'::jsonb) <> a then raise exception 'explicit VIN binding did not preserve identity A'; end if;
  if (select count(*) from public.fleet_vehicle_identity_aliases where identity_id=a and alias_type='REGNR' and alias_value='ABC123') <> 1 then raise exception 'REGNR provenance was not preserved'; end if;

  b := public.create_fleet_vehicle_identity('XYZ999', 'WVWZZZ22222222222', '2026-09-11 20:05+00', 'TEST', 'IDENTITY', 'B', null, '{}'::jsonb);
  select count(*), (select count(*) from public.fleet_vehicle_identities) into alias_count_before, identity_count_before from public.fleet_vehicle_identity_aliases;
  begin perform public.create_fleet_vehicle_identity('ABC123', 'WVWZZZ22222222222', '2026-09-11 20:06+00', 'TEST', 'IDENTITY', 'CONFLICT', null, '{}'::jsonb); raise exception 'identity conflict unexpectedly passed';
  exception when others then if sqlerrm = 'identity conflict unexpectedly passed' or position('IDENTITY_CONFLICT' in sqlerrm) = 0 then raise; end if; end;
  if (select count(*) from public.fleet_vehicle_identity_aliases) <> alias_count_before or (select count(*) from public.fleet_vehicle_identities) <> identity_count_before then raise exception 'identity conflict performed writes'; end if;

  f0 := public.append_fleet_membership_fact(a, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'MANUELL', 'Tester', null, '{}'::jsonb, '{}'::uuid[], null);
  retry := public.append_fleet_membership_fact(a, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'MANUELL', 'Tester', null, '{}'::jsonb, '{}'::uuid[], null);
  if retry <> f0 then raise exception 'exact source-event retry did not return same fact'; end if;
  select * into r from public.get_fleet_membership('ABC123', 'WVWZZZ11111111111');
  if r.membership_state <> 'ACTIVE' or r.membership_fact_id <> f0 then raise exception 'baseline ACTIVE acceptance failed'; end if;

  c := public.create_fleet_vehicle_identity('CCC333', null, '2026-09-11 21:01+00', 'TEST', 'IDENTITY', 'C', null, '{}'::jsonb);
  begin perform public.append_fleet_membership_fact(c, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], null); raise exception 'identity payload conflict unexpectedly passed'; exception when others then if sqlerrm = 'identity payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;
  begin perform public.append_fleet_membership_fact(a, 'INACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], null); raise exception 'state payload conflict unexpectedly passed'; exception when others then if sqlerrm = 'state payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;
  begin perform public.append_fleet_membership_fact(a, 'ACTIVE', 'ENTRY', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], null); raise exception 'basis payload conflict unexpectedly passed'; exception when others then if sqlerrm = 'basis payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;
  begin perform public.append_fleet_membership_fact(a, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00:01+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], null); raise exception 'effective-time payload conflict unexpectedly passed'; exception when others then if sqlerrm = 'effective-time payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;
  begin perform public.append_fleet_membership_fact(a, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], f0); raise exception 'correction-target payload conflict unexpectedly passed'; exception when others then if sqlerrm = 'correction-target payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;
  begin perform public.append_fleet_membership_fact(a, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-DIFFERENT', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], null); raise exception 'source-record payload conflict unexpectedly passed'; exception when others then if sqlerrm = 'source-record payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;

  f1 := public.append_fleet_membership_fact(a, 'INACTIVE', 'EXIT', '2026-09-11 22:00+00', 'TEST', 'MEMBERSHIP', 'REC-EXIT', 'EVENT-EXIT', null, 'SYSTEM', null, null, '{}'::jsonb, array[f0], null);
  select * into r from public.get_fleet_membership('ABC123', 'WVWZZZ11111111111');
  if r.membership_state <> 'INACTIVE' or r.membership_fact_id <> f1 then raise exception 'EXIT acceptance failed'; end if;

  begin perform public.append_fleet_membership_fact(a, 'ACTIVE', 'ENTRY', '2026-09-11 21:30+00', 'TEST', 'MEMBERSHIP', 'REC-LATE', 'EVENT-LATE', null, 'SYSTEM', null, null, '{}'::jsonb, array[f1], null); raise exception 'late older ENTRY unexpectedly passed';
  exception when others then if sqlerrm = 'late older ENTRY unexpectedly passed' then raise; end if; end;

  f2 := public.append_fleet_membership_fact(a, 'ACTIVE', 'ENTRY', '2026-09-11 23:00+00', 'TEST', 'MEMBERSHIP', 'REC-ENTRY', 'EVENT-ENTRY', null, 'SYSTEM', null, null, '{}'::jsonb, array[f1], null);
  select * into r from public.get_fleet_membership('ABC123', 'WVWZZZ11111111111');
  if r.membership_state <> 'ACTIVE' or r.membership_fact_id <> f2 then raise exception 're-entry acceptance failed'; end if;

  if exists(select 1 from pg_trigger t join pg_class cl on cl.oid=t.tgrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname='public' and cl.relname in ('checkins','vehicle_edits','rental_operational_facts') and not t.tgisinternal and pg_get_triggerdef(t.oid) ilike '%fleet_membership%') then raise exception 'operational source trigger isolation failed'; end if;

  begin update public.fleet_membership_facts set actor_name='MUTATED' where fact_id=f0; raise exception 'direct update unexpectedly passed'; exception when others then if sqlerrm='direct update unexpectedly passed' then raise; end if; end;
  begin delete from public.fleet_membership_facts where fact_id=f0; raise exception 'direct delete unexpectedly passed'; exception when others then if sqlerrm='direct delete unexpectedly passed' then raise; end if; end;

  insert into public.fleet_membership_facts(identity_id,membership_state,basis,effective_at,source_system,source_entity,source_record_id,source_event_id,actor_source,evidence) values(a,'INACTIVE','EXIT','2026-09-11 23:30+00','TEST_PRIV','CONFLICT','BRANCH','EVENT-BRANCH','SYSTEM','{}'::jsonb) returning fact_id into f_branch;
  select * into r from public.get_fleet_membership('ABC123', 'WVWZZZ11111111111');
  if r.membership_state <> 'UNKNOWN' or r.resolution_reason <> 'FACT_CONFLICT' or r.membership_fact_id is not null then raise exception 'FACT_CONFLICT reducer acceptance failed'; end if;

  select array_agg(f.fact_id order by f.fact_id) into heads from public.fleet_membership_facts f where f.identity_id=a and not exists(select 1 from public.fleet_membership_fact_predecessors e where e.predecessor_fact_id=f.fact_id);
  select membership_state into original_state from public.fleet_membership_facts where fact_id=f2;
  f_corr := public.append_fleet_membership_fact(a,'ACTIVE','CORRECTION','2026-09-12 00:00+00','TEST','MEMBERSHIP','REC-CORR','EVENT-CORR',null,'MANUELL','Tester',null,'{"reason":"resolve conflict"}'::jsonb,heads,f_branch);
  select * into r from public.get_fleet_membership('ABC123', 'WVWZZZ11111111111');
  if r.membership_state <> 'ACTIVE' or r.membership_fact_id <> f_corr then raise exception 'CORRECTION resolution failed'; end if;
  if (select membership_state from public.fleet_membership_facts where fact_id=f2) <> original_state then raise exception 'CORRECTION rewrote original fact'; end if;

  if has_table_privilege('authenticated','public.fleet_membership_facts','INSERT') or has_table_privilege('anon','public.fleet_membership_facts','INSERT') or has_table_privilege('service_role','public.fleet_membership_facts','INSERT') then raise exception 'direct fact INSERT grant exists'; end if;
end $$;

rollback;
SQL

"${PSQL[@]}" -f "$wrapper" >/tmp/cfm_rollback.out
if "${PSQL[@]}" -Atc "select to_regclass('public.fleet_membership_facts') is not null" | grep -qx 't'; then echo "rollback leaked canonical membership schema" >&2; exit 1; fi
echo "rollback acceptance: PASS"

"${PSQL[@]}" -f "$MIGRATION" >/tmp/cfm_migration.out
race_sql() { local sql="$1" out="$2" err="$3"; "${PSQL[@]}" -Atc "$sql" >"$out" 2>"$err"; }

sql_reg="select public.create_fleet_vehicle_identity('RACE001',null,'2026-09-12 00:10+00','RACE','IDENTITY','REG',null,'{}'::jsonb);"
race_sql "$sql_reg" /tmp/cfm_reg1.out /tmp/cfm_reg1.err & p1=$!; race_sql "$sql_reg" /tmp/cfm_reg2.out /tmp/cfm_reg2.err & p2=$!; wait "$p1"; wait "$p2"
[[ "$(cat /tmp/cfm_reg1.out)" == "$(cat /tmp/cfm_reg2.out)" ]]
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_type='REGNR' and alias_value='RACE001'")" == "1" ]]

sql_vin="select public.create_fleet_vehicle_identity(null,'WVWZZZRACE0000001','2026-09-12 00:11+00','RACE','IDENTITY','VIN',null,'{}'::jsonb);"
race_sql "$sql_vin" /tmp/cfm_vin1.out /tmp/cfm_vin1.err & p1=$!; race_sql "$sql_vin" /tmp/cfm_vin2.out /tmp/cfm_vin2.err & p2=$!; wait "$p1"; wait "$p2"
[[ "$(cat /tmp/cfm_vin1.out)" == "$(cat /tmp/cfm_vin2.out)" ]]
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_type='VIN' and alias_value='WVWZZZRACE0000001'")" == "1" ]]

sql_both="select public.create_fleet_vehicle_identity('RACE002','WVWZZZRACE0000002','2026-09-12 00:12+00','RACE','IDENTITY','BOTH',null,'{}'::jsonb);"
race_sql "$sql_both" /tmp/cfm_both1.out /tmp/cfm_both1.err & p1=$!; race_sql "$sql_both" /tmp/cfm_both2.out /tmp/cfm_both2.err & p2=$!; wait "$p1"; wait "$p2"
[[ "$(cat /tmp/cfm_both1.out)" == "$(cat /tmp/cfm_both2.out)" ]]
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_value in ('RACE002','WVWZZZRACE0000002')")" == "1" ]]

("${PSQL[@]}" -Atc "select public.create_fleet_vehicle_identity('RACE003',null,'2026-09-12 00:13+00','RACE','IDENTITY','MIX-REG',null,'{}'::jsonb);" >/tmp/cfm_mix1.out 2>/tmp/cfm_mix1.err) & p1=$!
("${PSQL[@]}" -Atc "select public.create_fleet_vehicle_identity('RACE003','WVWZZZRACE0000003','2026-09-12 00:13+00','RACE','IDENTITY','MIX-BOTH',null,'{}'::jsonb);" >/tmp/cfm_mix2.out 2>/tmp/cfm_mix2.err) & p2=$!
set +e; wait "$p1"; r1=$?; wait "$p2"; r2=$?; set -e
[[ "$r1" -eq 0 || "$r2" -eq 0 ]]
if [[ "$r1" -ne 0 ]]; then grep -q 'IDENTITY_BINDING_REQUIRED' /tmp/cfm_mix1.err; fi
if [[ "$r2" -ne 0 ]]; then grep -q 'IDENTITY_BINDING_REQUIRED' /tmp/cfm_mix2.err; fi
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_type='REGNR' and alias_value='RACE003'")" == "1" ]]
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_type='VIN' and alias_value='WVWZZZRACE0000003'")" -le 1 ]]
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_value in ('RACE003','WVWZZZRACE0000003')")" -le 1 ]]

race_identity="$("${PSQL[@]}" -Atc "select public.create_fleet_vehicle_identity('RACE004',null,'2026-09-12 00:14+00','RACE','IDENTITY','SRC',null,'{}'::jsonb);")"
sql_event_exact="select public.append_fleet_membership_fact('${race_identity}'::uuid,'ACTIVE','CURRENT_BASELINE','2026-09-12 00:15+00','RACE','MEMBERSHIP','REC-RACE','EVENT-RACE',null,'SYSTEM',null,null,'{}'::jsonb,'{}'::uuid[],null);"
race_sql "$sql_event_exact" /tmp/cfm_evt1.out /tmp/cfm_evt1.err & p1=$!; race_sql "$sql_event_exact" /tmp/cfm_evt2.out /tmp/cfm_evt2.err & p2=$!; wait "$p1"; wait "$p2"
[[ "$(cat /tmp/cfm_evt1.out)" == "$(cat /tmp/cfm_evt2.out)" ]]
[[ "$("${PSQL[@]}" -Atc "select count(*) from public.fleet_membership_facts where source_system='RACE' and source_entity='MEMBERSHIP' and source_event_id='EVENT-RACE'")" == "1" ]]

race_identity2="$("${PSQL[@]}" -Atc "select public.create_fleet_vehicle_identity('RACE005',null,'2026-09-12 00:16+00','RACE','IDENTITY','SRC2',null,'{}'::jsonb);")"
sql_event_a="select public.append_fleet_membership_fact('${race_identity2}'::uuid,'ACTIVE','CURRENT_BASELINE','2026-09-12 00:17+00','RACE','MEMBERSHIP','REC-CONFLICT','EVENT-CONFLICT',null,'SYSTEM',null,null,'{}'::jsonb,'{}'::uuid[],null);"
sql_event_b="select public.append_fleet_membership_fact('${race_identity2}'::uuid,'UNKNOWN','CURRENT_BASELINE','2026-09-12 00:17+00','RACE','MEMBERSHIP','REC-CONFLICT','EVENT-CONFLICT',null,'SYSTEM',null,null,'{}'::jsonb,'{}'::uuid[],null);"
(race_sql "$sql_event_a" /tmp/cfm_evta.out /tmp/cfm_evta.err) & p1=$!; (race_sql "$sql_event_b" /tmp/cfm_evtb.out /tmp/cfm_evtb.err) & p2=$!
set +e; wait "$p1"; er1=$?; wait "$p2"; er2=$?; set -e
[[ "$er1" -ne "$er2" ]]
if [[ "$er1" -ne 0 ]]; then grep -q 'SOURCE_EVENT_CONFLICT' /tmp/cfm_evta.err; fi
if [[ "$er2" -ne 0 ]]; then grep -q 'SOURCE_EVENT_CONFLICT' /tmp/cfm_evtb.err; fi
[[ "$("${PSQL[@]}" -Atc "select count(*) from public.fleet_membership_facts where source_system='RACE' and source_entity='MEMBERSHIP' and source_event_id='EVENT-CONFLICT'")" == "1" ]]

echo "concurrency acceptance: PASS"
