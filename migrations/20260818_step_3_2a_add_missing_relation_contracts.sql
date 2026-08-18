-- Step 3.2A: add the three verified missing relation contracts.
--
-- Production preflight 2026-08-18:
-- - vehicle_receipts.checkin_id -> checkins.id: 126 populated, 0 orphans
-- - damages.nybil_inventering_id -> nybil_inventering.id: 5 populated, 0 orphans
-- - damage_comments.damage_id -> damages.id: 0 rows, 0 orphans
-- - all six participating columns are UUID
--
-- The constraints are added NOT VALID first so the catalog change is short.
-- New writes are still enforced immediately. Historical rows are validated by
-- the separate follow-up migration after this transaction has committed.
--
-- RESTRICT is deliberate: check-ins, Nybil records, damages, receipts and
-- comments are operational history/evidence and must not be cascade-deleted.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- PostgreSQL does not automatically index the referencing side of a foreign
-- key. The other two child columns already have verified indexes.
create index if not exists idx_damages_nybil_inventering_id
  on public.damages (nybil_inventering_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vehicle_receipts'::regclass
      and conname = 'vehicle_receipts_checkin_id_fkey'
  ) then
    alter table public.vehicle_receipts
      add constraint vehicle_receipts_checkin_id_fkey
      foreign key (checkin_id)
      references public.checkins (id)
      on delete restrict
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.damages'::regclass
      and conname = 'damages_nybil_inventering_id_fkey'
  ) then
    alter table public.damages
      add constraint damages_nybil_inventering_id_fkey
      foreign key (nybil_inventering_id)
      references public.nybil_inventering (id)
      on delete restrict
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.damage_comments'::regclass
      and conname = 'damage_comments_damage_id_fkey'
  ) then
    alter table public.damage_comments
      add constraint damage_comments_damage_id_fkey
      foreign key (damage_id)
      references public.damages (id)
      on delete restrict
      not valid;
  end if;
end
$$;

commit;
