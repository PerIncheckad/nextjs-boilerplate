-- SEC-HF-01: contain anonymous/public Storage writes without changing READ semantics.
-- Scope is limited to damage-photos, nybil-photos and receipts.
--
-- Security boundary:
--   Supabase `authenticated` is NOT sufficient authorization for INCHECKAD.
--   Every browser Storage INSERT must also pass the existing canonical
--   application-user gate: private.is_app_user().
--
-- Evidence integrity:
--   Current Check-in and receipt uploads are create-only (upsert=false).
--   Nybil reference photos are create-only. Nybil damage upload currently sends
--   upsert=true, but current path construction/duplicate handling provides unique
--   event paths and no business requirement for overwriting established evidence
--   has been identified. Therefore SEC-HF-01 grants no UPDATE policy: a collision
--   must not become an overwrite.
--
-- Public bucket flags and all SELECT policies are intentionally untouched.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ---------------------------------------------------------------------------
-- Remove every current INSERT/UPDATE path for the three target buckets.
-- RLS policies are permissive, so leaving any legacy broad policy in place would
-- bypass the new private.is_app_user() gate.
-- ---------------------------------------------------------------------------

-- damage-photos
drop policy if exists "Give users authenticated access to folder 1h5ptwf_1" on storage.objects;
drop policy if exists "Public insert to damage-photos" on storage.objects;
drop policy if exists "Public upload damage-photos" on storage.objects;
drop policy if exists "Public update damage-photos" on storage.objects;

-- nybil-photos
drop policy if exists "Allow authenticated users to upload nybil-photos" on storage.objects;
drop policy if exists "Allow authenticated users to update nybil-photos" on storage.objects;
drop policy if exists "Allow public uploads to nybil-photos" on storage.objects;
drop policy if exists "Allow public updates to nybil-photos" on storage.objects;

-- receipts
drop policy if exists "Allow authenticated users to upload receipts" on storage.objects;
drop policy if exists "Allow authenticated users to update receipts" on storage.objects;
drop policy if exists "Allow public uploads to receipts" on storage.objects;
drop policy if exists "Allow public updates to receipts" on storage.objects;

-- ---------------------------------------------------------------------------
-- Minimal current-main browser write contracts.
-- No UPDATE or DELETE policy is created by this hotfix.
-- ---------------------------------------------------------------------------

-- CHECK-IN -> damage-photos:
--   REG/REG-YYYYMMDD/event-folder/file
-- NYBIL -> damage-photos:
--   REG/SKADOR/event-folder/file
create policy storage_damage_photos_app_user_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'damage-photos'
  and (select private.is_app_user())
  and (storage.foldername(name))[1] is not null
  and (storage.foldername(name))[3] is not null
  and (
    (storage.foldername(name))[2] = 'SKADOR'
    or (storage.foldername(name))[2] like ((storage.foldername(name))[1] || '-%')
  )
);

-- NYBIL reference photos:
--   REG/NYBIL-REFERENS/YYYYMMDD-NYBIL{-DUBBLETT-N}/file
create policy storage_nybil_photos_app_user_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'nybil-photos'
  and (select private.is_app_user())
  and (storage.foldername(name))[1] is not null
  and (storage.foldername(name))[2] = 'NYBIL-REFERENS'
  and (storage.foldername(name))[3] is not null
);

-- CHECK-IN fuel receipt:
--   REG/file
create policy storage_receipts_app_user_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (select private.is_app_user())
  and (storage.foldername(name))[1] is not null
  and (storage.foldername(name))[2] is null
);

commit;
