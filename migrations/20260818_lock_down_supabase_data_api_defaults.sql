-- Step 3.1A follow-up hardening for the same Data API boundary.
--
-- This deliberately targets existing PUBLIC/anon/authenticated grants and
-- postgres-owned future objects. Supabase platform-owned default privileges
-- under supabase_admin are not modified here because the application migration
-- role (postgres) is not a member of supabase_admin.

begin;

-- PUBLIC privileges are inherited by every role. Current Production has no
-- explicit PUBLIC table grants, but revoke them defensively so a later policy
-- change cannot reactivate access through an inherited table privilege.
revoke all privileges on all tables in schema public from public, anon, authenticated;

-- Existing projects also carry broad legacy sequence grants. Current browser
-- inserts use UUID defaults and do not require sequence access.
revoke all privileges on all sequences in schema public from public, anon, authenticated;

-- Harden defaults for app/database objects created by the postgres migration
-- role. service_role defaults are intentionally preserved for server-side work.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
