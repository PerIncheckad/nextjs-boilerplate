-- Step 3.1A compatibility hardening for the current Status client.
--
-- Status executes lib/vehicle-status.ts in the browser. Preserve only its
-- verified read contracts, gated by private.is_app_user(), while converting
-- the two required lookup RPCs from SECURITY DEFINER to SECURITY INVOKER.

begin;

-- arrivals: Status reads arrival history directly. Replace the broad
-- authenticated=true read policy with application-user authorization.
alter table public.arrivals enable row level security;
drop policy if exists "Authenticated users can read arrivals" on public.arrivals;

create policy arrivals_select_app_users
on public.arrivals
for select
to authenticated
using ((select private.is_app_user()));

grant select on table public.arrivals to authenticated;

-- damage_comments: Status reads comments for known damages directly.
alter table public.damage_comments enable row level security;
drop policy if exists damage_comments_select_app_users on public.damage_comments;

create policy damage_comments_select_app_users
on public.damage_comments
for select
to authenticated
using ((select private.is_app_user()));

grant select on table public.damage_comments to authenticated;

-- damages_external is the source behind the BUHS lookup RPC. It remains
-- read-only for authorized app users so the RPC can run as SECURITY INVOKER.
alter table public.damages_external enable row level security;
drop policy if exists damages_external_select_app_users on public.damages_external;

create policy damages_external_select_app_users
on public.damages_external
for select
to authenticated
using ((select private.is_app_user()));

grant select on table public.damages_external to authenticated;

-- Vehicle lookup: caller privileges + RLS on public.vehicles.
alter function public.get_vehicle_by_trimmed_regnr(text) security invoker;
alter function public.get_vehicle_by_trimmed_regnr(text) set search_path = public;
grant execute on function public.get_vehicle_by_trimmed_regnr(text) to authenticated, service_role;

-- BUHS damage lookup: caller privileges + RLS on public.damages_external.
alter function public.get_damages_by_trimmed_regnr(text) security invoker;
alter function public.get_damages_by_trimmed_regnr(text) set search_path = public;
grant execute on function public.get_damages_by_trimmed_regnr(text) to authenticated, service_role;

commit;
