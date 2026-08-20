drop policy if exists employees_select_self_app on public.employees;
create policy employees_select_self_app
on public.employees
for select
to authenticated
using (
  (select private.is_app_user())
  and lower(email) = lower((select auth.jwt() ->> 'email'))
);

drop policy if exists checkin_drafts_select_self_app on public.checkin_drafts;
create policy checkin_drafts_select_self_app
on public.checkin_drafts
for select
to authenticated
using (
  (select private.is_app_user())
  and lower(user_email) = lower((select auth.jwt() ->> 'email'))
);

drop policy if exists "Enable read access for all users" on public.damages_current;
drop policy if exists "Public read damages_current" on public.damages_current;
