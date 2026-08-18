-- Step 3.1A: close direct Supabase Data API paths without changing business logic.
--
-- Goals:
-- 1. No anonymous database-table/RPC access through the public Data API.
-- 2. Signed-in users only receive browser-level database access when they are
--    an existing application user (current whitelist OR active employee).
-- 3. The browser receives only the object privileges used by current main.
-- 4. Server-side service_role behavior is preserved.
-- 5. SECURITY DEFINER RPCs are no longer executable by anon/authenticated;
--    get_all_allowed_plates remains browser-accessible as SECURITY INVOKER.

begin;

-- ---------------------------------------------------------------------------
-- Internal authorization helper. `private` is not an exposed Data API schema.
-- Keep this list synchronized with lib/access-control.ts until authorization
-- governance is consolidated in a later, separately reviewed change.
-- ---------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_app_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      lower(auth.jwt() ->> 'email') = any (array[
        'per.andersson@mabi.se',
        'per.enskede@gmail.com',
        'ingemar.carqueija@mabi.se',
        'latif.mutlu@mabi.se',
        'hugo.carqueija@gmail.com',
        'benjamin.mutlu@outlook.com',
        'oliwer.fredriksson@mabi.se',
        'louise.espe@mabi.se',
        'lucas.nemeth@mabi.se',
        'isak.brandeby@mabi.se',
        'noorullah.mohammad.zarif@mabi.se',
        'maciej.krupa@mabi.se',
        'nimet.mecaj@mabi.se',
        'lukas.svensson@mabi.se',
        'leo.hedenberg@mabi.se',
        'anders.larsson@mabi.se',
        'haris.poricanin@mabi.se',
        'mikael.gronqvist@mabi.se',
        'ludvig.johansson@mabi.se',
        'joachim.mellden@mabi.se',
        'felicia.sarlov@mabi.se',
        'mohamed.ismael@mabi.se',
        'linus.croon@mabi.se',
        'wanda.andersson@mabi.se',
        'dan.hermodsson@mabi.se',
        'elvir.poricanin@mabi.se',
        'asa.andersson@mabi.se',
        'dilot_85@hotmail.com',
        'alicia.carqueija@mabi.se',
        'isak.andersson@mabi.se',
        'isakeandersson@gmail.com',
        'lucianoinzunza71@gmail.com',
        'helsingborg@mabi.se'
      ]::text[]),
      false
    )
    or exists (
      select 1
      from public.employees e
      where lower(e.email) = lower(auth.jwt() ->> 'email')
        and e.is_active is true
    );
$$;

revoke all on function private.is_app_user() from public, anon;
grant execute on function private.is_app_user() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Close the broad default Data API surface first, then explicitly re-grant
-- only the browser contracts used by current main. service_role is untouched.
-- ---------------------------------------------------------------------------
revoke all privileges on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Preserve current server-side RPC behavior after removing PUBLIC execute.
grant execute on all functions in schema public to service_role;

-- Prevent new public-schema objects from silently reopening the same boundary.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- employees: remove self-provisioning / self-activation paths.
-- Browser only needs to read its own row for LoginGate when not whitelisted.
-- ---------------------------------------------------------------------------
alter table public.employees enable row level security;

drop policy if exists "Public read employees" on public.employees;
drop policy if exists employees_insert_admin_like on public.employees;
drop policy if exists employees_select_self on public.employees;
drop policy if exists employees_update_self on public.employees;

create policy employees_select_self_app
on public.employees
for select
to authenticated
using (
  (select private.is_app_user())
  and lower(email) = lower(auth.jwt() ->> 'email')
);

grant select on table public.employees to authenticated;

-- ---------------------------------------------------------------------------
-- vehicles: browser SELECT is required by Nybil duplicate detection and Rapport.
-- ---------------------------------------------------------------------------
alter table public.vehicles enable row level security;
drop policy if exists "Enable read access for all users" on public.vehicles;

create policy vehicles_select_app_users
on public.vehicles
for select
to authenticated
using ((select private.is_app_user()));

grant select on table public.vehicles to authenticated;

-- ---------------------------------------------------------------------------
-- nybil_inventering: current Nybil browser flow reads/inserts/updates directly.
-- DELETE is intentionally not granted.
-- ---------------------------------------------------------------------------
alter table public.nybil_inventering enable row level security;
drop policy if exists "Allow all for authenticated users" on public.nybil_inventering;

create policy nybil_select_app_users
on public.nybil_inventering
for select
to authenticated
using ((select private.is_app_user()));

create policy nybil_insert_app_users
on public.nybil_inventering
for insert
to authenticated
with check ((select private.is_app_user()));

create policy nybil_update_app_users
on public.nybil_inventering
for update
to authenticated
using ((select private.is_app_user()))
with check ((select private.is_app_user()));

grant select, insert, update on table public.nybil_inventering to authenticated;

-- ---------------------------------------------------------------------------
-- damages: Nybil inserts damage evidence directly; Rapport reads it directly.
-- ---------------------------------------------------------------------------
alter table public.damages enable row level security;

drop policy if exists damages_select_app_users on public.damages;
drop policy if exists damages_insert_app_users on public.damages;

create policy damages_select_app_users
on public.damages
for select
to authenticated
using ((select private.is_app_user()));

create policy damages_insert_app_users
on public.damages
for insert
to authenticated
with check ((select private.is_app_user()));

grant select, insert on table public.damages to authenticated;

-- ---------------------------------------------------------------------------
-- damage_media: Rapport reads media metadata directly.
-- ---------------------------------------------------------------------------
alter table public.damage_media enable row level security;
drop policy if exists damage_media_select_app_users on public.damage_media;

create policy damage_media_select_app_users
on public.damage_media
for select
to authenticated
using ((select private.is_app_user()));

grant select on table public.damage_media to authenticated;

-- ---------------------------------------------------------------------------
-- vehicle_edits: Check/Ankomst/Status browser code reads latest sale overrides.
-- Writes remain server-side.
-- ---------------------------------------------------------------------------
alter table public.vehicle_edits enable row level security;
drop policy if exists vehicle_edits_select_app_users on public.vehicle_edits;

create policy vehicle_edits_select_app_users
on public.vehicle_edits
for select
to authenticated
using ((select private.is_app_user()));

grant select on table public.vehicle_edits to authenticated;

-- ---------------------------------------------------------------------------
-- checkin_drafts: current repo has a browser reader but no current writer.
-- Keep only read access to the signed-in user's own drafts.
-- ---------------------------------------------------------------------------
alter table public.checkin_drafts enable row level security;

drop policy if exists p_drafts_delete on public.checkin_drafts;
drop policy if exists p_drafts_insert on public.checkin_drafts;
drop policy if exists p_drafts_select on public.checkin_drafts;
drop policy if exists p_drafts_update on public.checkin_drafts;

create policy checkin_drafts_select_self_app
on public.checkin_drafts
for select
to authenticated
using (
  (select private.is_app_user())
  and lower(user_email) = lower(auth.jwt() ->> 'email')
);

grant select on table public.checkin_drafts to authenticated;

-- ---------------------------------------------------------------------------
-- checkins: remove public/anon write access. Browser SELECT is retained only
-- because get_all_allowed_plates is converted to SECURITY INVOKER below.
-- All normal Check persistence continues through service_role on the server.
-- ---------------------------------------------------------------------------
alter table public.checkins enable row level security;

drop policy if exists "Public insert checkins" on public.checkins;
drop policy if exists "Public select checkins" on public.checkins;
drop policy if exists "Public select checkins limited" on public.checkins;
drop policy if exists "Public update checkins" on public.checkins;
drop policy if exists checkins_delete on public.checkins;
drop policy if exists checkins_insert on public.checkins;
drop policy if exists checkins_select on public.checkins;
drop policy if exists checkins_update on public.checkins;

create policy checkins_select_app_users
on public.checkins
for select
to authenticated
using ((select private.is_app_user()));

grant select on table public.checkins to authenticated;

-- checkin_damages is server-side in current main. Remove legacy browser grants.
alter table public.checkin_damages enable row level security;
drop policy if exists "Public insert checkin_damages" on public.checkin_damages;
drop policy if exists "Public read checkin_damages" on public.checkin_damages;
drop policy if exists insert_checkin_damages_authenticated on public.checkin_damages;

-- Legacy photo-table anon policies are dead once table grants are revoked; drop
-- them explicitly so future grant changes cannot silently reactivate them.
alter table public.checkin_damage_photos enable row level security;
drop policy if exists "Public insert checkin_damage_photos" on public.checkin_damage_photos;
drop policy if exists "Public select checkin_damage_photos" on public.checkin_damage_photos;

-- ---------------------------------------------------------------------------
-- Browser RPC allowlist.
-- get_all_allowed_plates is the only RPC referenced by current client code.
-- Run it as the caller so RLS on vehicles/nybil/checkins remains authoritative.
-- ---------------------------------------------------------------------------
alter function public.get_all_allowed_plates() security invoker;
alter function public.get_all_allowed_plates() set search_path = public;
grant execute on function public.get_all_allowed_plates() to authenticated, service_role;

commit;
