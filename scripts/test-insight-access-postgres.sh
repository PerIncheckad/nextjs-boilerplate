#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 -X)

"${PSQL[@]}" <<'SQL'
begin;

create extension if not exists pgcrypto;
create schema if not exists public;

create table public.employees (
  id uuid primary key,
  email text,
  is_active boolean not null default true,
  active boolean
);

\i migrations/20260823191000_add_roles_mandates_contract_v1.sql
\i migrations/20260825212000_add_module_access_capabilities_v1.sql
\i migrations/20260917015000_add_access_insight_capability_v1.sql

-- The migration may register the capability, but it must never seed a person mandate.
do $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from public.mandate_capability_definitions
    where capability_code = 'ACCESS_INSIGHT' and active
  ) then
    raise exception 'ACCESS_INSIGHT capability missing';
  end if;

  select count(*) into v_count from public.employee_mandates;
  if v_count <> 0 then
    raise exception 'ACCESS_INSIGHT migration unexpectedly seeded employee mandates: %', v_count;
  end if;
end;
$$;

insert into public.employees(id,email,is_active,active) values
  ('10000000-0000-4000-8000-000000000101','global@example.com',true,true),
  ('10000000-0000-4000-8000-000000000102','wrong-scope@example.com',true,true),
  ('10000000-0000-4000-8000-000000000103','expired@example.com',true,true),
  ('10000000-0000-4000-8000-000000000104','revoked@example.com',true,true),
  ('10000000-0000-4000-8000-000000000105','inactive@example.com',false,true);

insert into public.employee_mandates(
  mandate_id, employee_id, function_code, capability_code,
  scope_type, scope_code, active, valid_from, valid_until,
  grant_reason, revoked_by, revoked_at, revoke_reason
) values
  (
    '20000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000101',
    'CEO','ACCESS_INSIGHT','GLOBAL',null,true,now() - interval '1 day',null,
    'INSIGHT CI fixture',null,null,null
  ),
  (
    '20000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000102',
    'CEO','ACCESS_INSIGHT','PROCESS','INSIGHT',true,now() - interval '1 day',null,
    'INSIGHT CI fixture',null,null,null
  ),
  (
    '20000000-0000-4000-8000-000000000103',
    '10000000-0000-4000-8000-000000000103',
    'CEO','ACCESS_INSIGHT','GLOBAL',null,true,now() - interval '3 days',now() - interval '1 day',
    'INSIGHT CI fixture',null,null,null
  ),
  (
    '20000000-0000-4000-8000-000000000104',
    '10000000-0000-4000-8000-000000000104',
    'CEO','ACCESS_INSIGHT','GLOBAL',null,true,now() - interval '3 days',null,
    'INSIGHT CI fixture','30000000-0000-4000-8000-000000000104',now() - interval '1 hour','CI revoke'
  ),
  (
    '20000000-0000-4000-8000-000000000105',
    '10000000-0000-4000-8000-000000000105',
    'CEO','ACCESS_INSIGHT','GLOBAL',null,true,now() - interval '1 day',null,
    'INSIGHT CI fixture',null,null,null
  );

do $$
begin
  if not public.actor_has_process_mandate(
    '10000000-0000-4000-8000-000000000101',
    'ACCESS_INSIGHT',null,'GLOBAL',null,now()
  ) then
    raise exception 'GLOBAL ACCESS_INSIGHT mandate should pass';
  end if;

  if public.actor_has_process_mandate(
    '10000000-0000-4000-8000-000000000102',
    'ACCESS_INSIGHT',null,'GLOBAL',null,now()
  ) then
    raise exception 'PROCESS ACCESS_INSIGHT mandate incorrectly passed GLOBAL gate';
  end if;

  if public.actor_has_process_mandate(
    '10000000-0000-4000-8000-000000000103',
    'ACCESS_INSIGHT',null,'GLOBAL',null,now()
  ) then
    raise exception 'Expired ACCESS_INSIGHT mandate incorrectly passed';
  end if;

  if public.actor_has_process_mandate(
    '10000000-0000-4000-8000-000000000104',
    'ACCESS_INSIGHT',null,'GLOBAL',null,now()
  ) then
    raise exception 'Revoked ACCESS_INSIGHT mandate incorrectly passed';
  end if;

  if public.actor_has_process_mandate(
    '10000000-0000-4000-8000-000000000105',
    'ACCESS_INSIGHT',null,'GLOBAL',null,now()
  ) then
    raise exception 'Inactive employee incorrectly passed ACCESS_INSIGHT';
  end if;
end;
$$;

rollback;
SQL

echo "INSIGHT ACCESS PostgreSQL acceptance PASS (transaction rolled back)"
