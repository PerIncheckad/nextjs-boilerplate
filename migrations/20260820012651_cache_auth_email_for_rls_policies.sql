create or replace function private.current_auth_email()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(auth.jwt() ->> 'email');
$$;

revoke all on function private.current_auth_email() from public, anon;
grant execute on function private.current_auth_email() to authenticated, service_role;

drop policy if exists employees_select_self_app on public.employees;
create policy employees_select_self_app
on public.employees
for select
to authenticated
using (
  (select private.is_app_user())
  and lower(email) = (select private.current_auth_email())
);

drop policy if exists checkin_drafts_select_self_app on public.checkin_drafts;
create policy checkin_drafts_select_self_app
on public.checkin_drafts
for select
to authenticated
using (
  (select private.is_app_user())
  and lower(user_email) = (select private.current_auth_email())
);
