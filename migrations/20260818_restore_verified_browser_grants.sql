-- Step 3.1A ordering correction.
--
-- The default-hardening migration intentionally revokes broad browser grants.
-- This final migration restores only the verified current browser contracts,
-- with RLS from the preceding migrations remaining authoritative.

begin;

grant usage on schema private to authenticated, service_role;
grant execute on function private.is_app_user() to authenticated, service_role;

grant select on table public.employees to authenticated;
grant select on table public.vehicles to authenticated;
grant select, insert, update on table public.nybil_inventering to authenticated;
grant select, insert on table public.damages to authenticated;
grant select on table public.damage_media to authenticated;
grant select on table public.vehicle_edits to authenticated;
grant select on table public.checkin_drafts to authenticated;
grant select on table public.checkins to authenticated;
grant select on table public.arrivals to authenticated;
grant select on table public.damage_comments to authenticated;
grant select on table public.damages_external to authenticated;

grant execute on function public.get_all_allowed_plates() to authenticated, service_role;
grant execute on function public.get_vehicle_by_trimmed_regnr(text) to authenticated, service_role;
grant execute on function public.get_damages_by_trimmed_regnr(text) to authenticated, service_role;

commit;
