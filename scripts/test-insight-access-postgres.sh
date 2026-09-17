#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 -X)
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

cat > "$TMP" <<'SQL'
begin;

-- Minimal fixture-only prerequisites required by the existing mandate foundation
-- when it is executed against a clean PostgreSQL test database. These objects
-- reproduce only the schema surface referenced while defining the real mandate
-- migration; no Handoff business flow is exercised by this INSIGHT acceptance.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table public.employees (
  id uuid primary key,
  full_name text not null,
  email text,
  active boolean,
  is_active boolean not null default true
);

create table public.handoff_definitions (
  handoff_code text not null,
  handoff_version integer not null,
  from_function text not null,
  to_function text not null,
  primary key (handoff_code, handoff_version)
);

create table public.handoffs (
  handoff_id uuid primary key default gen_random_uuid(),
  handoff_code text not null,
  handoff_version integer not null
);

create or replace function public.transition_handoff(
  p_handoff_id uuid,
  p_next_status text,
  p_comment text,
  p_evidence_refs jsonb,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_source text
)
returns jsonb
language plpgsql
as $$
begin
  raise exception 'fixture transition_handoff must not execute in INSIGHT authorization acceptance';
end;
$$;
SQL

# Execute the existing mandate foundation and module definitions inside the same
# outer transaction so every fixture and the INSIGHT capability are rolled back.
sed '/^begin;$/d;/^commit;$/d' migrations/20260823191000_add_roles_mandates_contract_v1.sql >> "$TMP"
sed '/^begin;$/d;/^commit;$/d' migrations/20260825212000_add_module_access_capabilities_v1.sql >> "$TMP"
sed '/^begin;$/d;/^commit;$/d' migrations/20260917001500_add_access_insight_capability_v1.sql >> "$TMP"

cat >> "$TMP" <<'SQL'

do $$
declare v_count integer;
begin
  if not exists (
    select 1 from public.mandate_capability_definitions
    where capability_code = 'ACCESS_INSIGHT' and active
  ) then
    raise exception 'ACCESS_INSIGHT capability missing';
  end if;

  select count(*) into v_count from public.employee_mandates;
  if v_count <> 0 then
    raise exception 'INSIGHT migration unexpectedly seeded employee mandates: %', v_count;
  end if;
end;
$$;

insert into public.employees(id,full_name,email,active,is_active) values
  ('11000000-0000-4000-8000-000000000001','Global valid','global@example.com',true,true),
  ('11000000-0000-4000-8000-000000000002','Wrong scope','scope@example.com',true,true),
  ('11000000-0000-4000-8000-000000000003','Expired','expired@example.com',true,true),
  ('11000000-0000-4000-8000-000000000004','Revoked','revoked@example.com',true,true),
  ('11000000-0000-4000-8000-000000000005','Inactive','inactive@example.com',false,false);

insert into public.employee_mandates(
  mandate_id,employee_id,function_code,capability_code,scope_type,scope_code,active,valid_from,valid_until,grant_reason,revoked_by,revoked_at,revoke_reason
) values
  ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','CEO','ACCESS_INSIGHT','GLOBAL',null,true,now()-interval '1 day',null,'CI fixture',null,null,null),
  ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','CEO','ACCESS_INSIGHT','PROCESS','CHECKIN',true,now()-interval '1 day',null,'CI fixture',null,null,null),
  ('21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000003','CEO','ACCESS_INSIGHT','GLOBAL',null,true,now()-interval '2 days',now()-interval '1 day','CI fixture',null,null,null),
  ('21000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000004','CEO','ACCESS_INSIGHT','GLOBAL',null,true,now()-interval '2 days',null,'CI fixture','31000000-0000-4000-8000-000000000004',now()-interval '1 hour','revoked fixture'),
  ('21000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000005','CEO','ACCESS_INSIGHT','GLOBAL',null,true,now()-interval '1 day',null,'CI fixture',null,null,null);

do $$
begin
  if not public.actor_has_process_mandate('11000000-0000-4000-8000-000000000001','ACCESS_INSIGHT',null,'GLOBAL',null,now()) then
    raise exception 'GLOBAL ACCESS_INSIGHT mandate did not pass';
  end if;
  if public.actor_has_process_mandate('11000000-0000-4000-8000-000000000002','ACCESS_INSIGHT',null,'GLOBAL',null,now()) then
    raise exception 'PROCESS scope incorrectly passed GLOBAL INSIGHT gate';
  end if;
  if public.actor_has_process_mandate('11000000-0000-4000-8000-000000000003','ACCESS_INSIGHT',null,'GLOBAL',null,now()) then
    raise exception 'expired mandate incorrectly passed';
  end if;
  if public.actor_has_process_mandate('11000000-0000-4000-8000-000000000004','ACCESS_INSIGHT',null,'GLOBAL',null,now()) then
    raise exception 'revoked mandate incorrectly passed';
  end if;
  if public.actor_has_process_mandate('11000000-0000-4000-8000-000000000005','ACCESS_INSIGHT',null,'GLOBAL',null,now()) then
    raise exception 'inactive employee incorrectly passed';
  end if;
end;
$$;

rollback;
SQL

"${PSQL[@]}" -f "$TMP"
echo "INSIGHT ACCESS PostgreSQL acceptance: PASS (transaction rolled back)"
