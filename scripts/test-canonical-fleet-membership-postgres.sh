#!/usr/bin/env bash
set -euo pipefail

MIGRATION="migrations/20260911235900_create_canonical_fleet_membership_v1_foundation.sql"
DB="${PGDATABASE:-postgres}"
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -d "$DB")

body="$(mktemp)"
wrapper="$(mktemp)"
cleanup() { rm -f "$body" "$wrapper" /tmp/cfm_*.out /tmp/cfm_*.err; }
trap cleanup EXIT

# Remove only the migration's transaction wrapper so the exact body can be
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
  alias_count_before bigint; identity_count_before bigint;
  r record;
begin
  select * into r from public.get_fleet_membership('NOF001', null);
  if r.membership_state <> 'UNKNOWN' or r.resolution_reason <> 'NO_FACT' or r.membership_fact_id is not null then
    raise exception 'NO_FACT acceptance failed';
  end if;

  a := public.create_fleet_vehicle_identity('ABC 123', null, '2026-09-11 20:00+00', 'TEST', 'IDENTITY', 'A', null, '{}'::jsonb);
  if public.create_fleet_vehicle_identity('ABC123', null, '2026-09-11 20:01+00', 'TEST', 'IDENTITY', 'A2', null, '{}'::jsonb) <> a then
    raise exception 'REGNR resolve acceptance failed';
  end if;

  begin
    perform public.create_fleet_vehicle_identity('ABC123', 'WVWZZZ11111111111', '2026-09-11 20:02+00', 'TEST', 'IDENTITY', 'AUTO-BIND', null, '{}'::jsonb);
    raise exception 'implicit VIN binding unexpectedly passed';
  exception when others then
    if sqlerrm = 'implicit VIN binding unexpectedly passed' or position('IDENTITY_BINDING_REQUIRED' in sqlerrm) = 0 then raise; end if;
  end;

  perform public.bind_fleet_vehicle_identity_alias(a, 'VIN', 'WVWZZZ11111111111', '2026-09-11 20:03+00', 'TEST', 'IDENTITY_BINDING', 'BIND-A', null, '{"verified":true}'::jsonb);
  if public.create_fleet_vehicle_identity('ABC123', 'WVWZZZ11111111111', '2026-09-11 20:04+00', 'TEST', 'IDENTITY', 'RESOLVE-A', null, '{}'::jsonb) <> a then
    raise exception 'explicit VIN binding did not preserve identity A';
  end if;

  b := public.create_fleet_vehicle_identity('XYZ999', 'WVWZZZ22222222222', '2026-09-11 20:05+00', 'TEST', 'IDENTITY', 'B', null, '{}'::jsonb);
  select count(*), (select count(*) from public.fleet_vehicle_identities) into alias_count_before, identity_count_before
  from public.fleet_vehicle_identity_aliases;
  begin
    perform public.create_fleet_vehicle_identity('ABC123', 'WVWZZZ22222222222', '2026-09-11 20:06+00', 'TEST', 'IDENTITY', 'CONFLICT', null, '{}'::jsonb);
    raise exception 'identity conflict unexpectedly passed';
  exception when others then
    if sqlerrm = 'identity conflict unexpectedly passed' or position('IDENTITY_CONFLICT' in sqlerrm) = 0 then raise; end if;
  end;
  if (select count(*) from public.fleet_vehicle_identity_aliases) <> alias_count_before
     or (select count(*) from public.fleet_vehicle_identities) <> identity_count_before then
    raise exception 'identity conflict performed writes';
  end if;

  f0 := public.append_fleet_membership_fact(a, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'MANUELL', 'Tester', null, '{}'::jsonb, '{}'::uuid[], null);
  retry := public.append_fleet_membership_fact(a, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'MANUELL', 'Tester', null, '{}'::jsonb, '{}'::uuid[], null);
  if retry <> f0 then raise exception 'exact source-event retry did not return same fact'; end if;

  c := public.create_fleet_vehicle_identity('CCC333', null, '2026-09-11 21:01+00', 'TEST', 'IDENTITY', 'C', null, '{}'::jsonb);

  begin perform public.append_fleet_membership_fact(c, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], null); raise exception 'identity payload conflict unexpectedly passed';
  exception when others then if sqlerrm = 'identity payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;
  begin perform public.append_fleet_membership_fact(a, 'INACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], null); raise exception 'state payload conflict unexpectedly passed';
  exception when others then if sqlerrm = 'state payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;
  begin perform public.append_fleet_membership_fact(a, 'ACTIVE', 'ENTRY', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], null); raise exception 'basis payload conflict unexpectedly passed';
  exception when others then if sqlerrm = 'basis payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;
  begin perform public.append_fleet_membership_fact(a, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00:01+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], null); raise exception 'effective-time payload conflict unexpectedly passed';
  exception when others then if sqlerrm = 'effective-time payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;
  begin perform public.append_fleet_membership_fact(a, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-BASE', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], f0); raise exception 'correction-target payload conflict unexpectedly passed';
  exception when others then if sqlerrm = 'correction-target payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;
  begin perform public.append_fleet_membership_fact(a, 'ACTIVE', 'CURRENT_BASELINE', '2026-09-11 21:00+00', 'TEST', 'MEMBERSHIP', 'REC-DIFFERENT', 'EVENT-BASE', null, 'SYSTEM', null, null, '{}'::jsonb, '{}'::uuid[], null); raise exception 'source-record payload conflict unexpectedly passed';
  exception when others then if sqlerrm = 'source-record payload conflict unexpectedly passed' or position('SOURCE_EVENT_CONFLICT' in sqlerrm)=0 then raise; end if; end;

  f1 := public.append_fleet_membership_fact(a, 'INACTIVE', 'EXIT', '2026-09-11 22:00+00', 'TEST', 'MEMBERSHIP', 'REC-EXIT', 'EVENT-EXIT', null, 'SYSTEM', null, null, '{}'::jsonb, array[f0], null);
  select * into r from public.get_fleet_membership('ABC123', 'WVWZZZ11111111111');
  if r.membership_state <> 'INACTIVE' or r.membership_fact_id <> f1 then raise exception 'EXIT acceptance failed'; end if;

  begin
    perform public.append_fleet_membership_fact(a, 'ACTIVE', 'ENTRY', '2026-09-11 21:30+00', 'TEST', 'MEMBERSHIP', 'REC-LATE', 'EVENT-LATE', null, 'SYSTEM', null, null, '{}'::jsonb, array[f1], null);
    raise exception 'late older ENTRY unexpectedly passed';
  exception when others then
    if sqlerrm = 'late older ENTRY unexpectedly passed' then raise; end if;
  end;

  f2 := public.append_fleet_membership_fact(a, 'ACTIVE', 'ENTRY', '2026-09-11 23:00+00', 'TEST', 'MEMBERSHIP', 'REC-ENTRY', 'EVENT-ENTRY', null, 'SYSTEM', null, null, '{}'::jsonb, array[f1], null);
  select * into r from public.get_fleet_membership('ABC123', 'WVWZZZ11111111111');
  if r.membership_state <> 'ACTIVE' or r.membership_fact_id <> f2 then raise exception 're-entry acceptance failed'; end if;

  begin update public.fleet_membership_facts set actor_name='MUTATED' where fact_id=f0; raise exception 'direct update unexpectedly passed';
  exception when others then if sqlerrm='direct update unexpectedly passed' then raise; end if; end;
  begin delete from public.fleet_membership_facts where fact_id=f0; raise exception 'direct delete unexpectedly passed';
  exception when others then if sqlerrm='direct delete unexpectedly passed' then raise; end if; end;

  if has_table_privilege('authenticated','public.fleet_membership_facts','INSERT')
     or has_table_privilege('anon','public.fleet_membership_facts','INSERT')
     or has_table_privilege('service_role','public.fleet_membership_facts','INSERT') then
    raise exception 'direct fact INSERT grant exists';
  end if;
end $$;

rollback;
SQL

"${PSQL[@]}" -f "$wrapper" >/tmp/cfm_rollback.out
if "${PSQL[@]}" -Atc "select to_regclass('public.fleet_membership_facts') is not null" | grep -qx 't'; then
  echo "rollback leaked canonical membership schema" >&2
  exit 1
fi

echo "rollback acceptance: PASS"

# Concurrency acceptance runs in this disposable CI database only.
"${PSQL[@]}" -f "$MIGRATION" >/tmp/cfm_migration.out

race_create() {
  local sql="$1" out="$2" err="$3"
  "${PSQL[@]}" -Atc "$sql" >"$out" 2>"$err"
}

sql_reg="select public.create_fleet_vehicle_identity('RACE001',null,now(),'RACE','IDENTITY','REG',null,'{}'::jsonb);"
race_create "$sql_reg" /tmp/cfm_reg1.out /tmp/cfm_reg1.err & p1=$!
race_create "$sql_reg" /tmp/cfm_reg2.out /tmp/cfm_reg2.err & p2=$!
wait "$p1"; wait "$p2"
[[ "$(cat /tmp/cfm_reg1.out)" == "$(cat /tmp/cfm_reg2.out)" ]]
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_type='REGNR' and alias_value='RACE001'")" == "1" ]]

sql_vin="select public.create_fleet_vehicle_identity(null,'WVWZZZRACE0000001',now(),'RACE','IDENTITY','VIN',null,'{}'::jsonb);"
race_create "$sql_vin" /tmp/cfm_vin1.out /tmp/cfm_vin1.err & p1=$!
race_create "$sql_vin" /tmp/cfm_vin2.out /tmp/cfm_vin2.err & p2=$!
wait "$p1"; wait "$p2"
[[ "$(cat /tmp/cfm_vin1.out)" == "$(cat /tmp/cfm_vin2.out)" ]]
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_type='VIN' and alias_value='WVWZZZRACE0000001'")" == "1" ]]

sql_both="select public.create_fleet_vehicle_identity('RACE002','WVWZZZRACE0000002',now(),'RACE','IDENTITY','BOTH',null,'{}'::jsonb);"
race_create "$sql_both" /tmp/cfm_both1.out /tmp/cfm_both1.err & p1=$!
race_create "$sql_both" /tmp/cfm_both2.out /tmp/cfm_both2.err & p2=$!
wait "$p1"; wait "$p2"
[[ "$(cat /tmp/cfm_both1.out)" == "$(cat /tmp/cfm_both2.out)" ]]
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_value in ('RACE002','WVWZZZRACE0000002')")" == "1" ]]

# Mixed REGNR-only vs VIN+REGNR race: outcome may be same identity or explicit
# binding-required rejection, but it may never fork or cross-bind.
("${PSQL[@]}" -Atc "select public.create_fleet_vehicle_identity('RACE003',null,now(),'RACE','IDENTITY','MIX-REG',null,'{}'::jsonb);" >/tmp/cfm_mix1.out 2>/tmp/cfm_mix1.err) & p1=$!
("${PSQL[@]}" -Atc "select public.create_fleet_vehicle_identity('RACE003','WVWZZZRACE0000003',now(),'RACE','IDENTITY','MIX-BOTH',null,'{}'::jsonb);" >/tmp/cfm_mix2.out 2>/tmp/cfm_mix2.err) & p2=$!
set +e
wait "$p1"; r1=$?
wait "$p2"; r2=$?
set -e
[[ "$r1" -eq 0 || "$r2" -eq 0 ]]
if [[ "$r1" -ne 0 ]]; then grep -q 'IDENTITY_BINDING_REQUIRED' /tmp/cfm_mix1.err; fi
if [[ "$r2" -ne 0 ]]; then grep -q 'IDENTITY_BINDING_REQUIRED' /tmp/cfm_mix2.err; fi
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_type='REGNR' and alias_value='RACE003'")" == "1" ]]
[[ "$("${PSQL[@]}" -Atc "select count(distinct identity_id) from public.fleet_vehicle_identity_aliases where alias_type='VIN' and alias_value='WVWZZZRACE0000003'")" != "2" ]]

echo "concurrency acceptance: PASS"
