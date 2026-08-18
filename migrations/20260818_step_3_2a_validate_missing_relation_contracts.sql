-- Step 3.2A: validate the relation contracts added by the preceding migration.
--
-- Each validation runs in its own short transaction. The lock timeout makes
-- the migration fail safely instead of waiting behind live Production traffic.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.vehicle_receipts
  validate constraint vehicle_receipts_checkin_id_fkey;
commit;

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.damages
  validate constraint damages_nybil_inventering_id_fkey;
commit;

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.damage_comments
  validate constraint damage_comments_damage_id_fkey;
commit;
