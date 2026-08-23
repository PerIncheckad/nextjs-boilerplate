begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Cover the FK used when canonical Layer 1 facts point back to immutable RAW
-- source evidence. This removes the Supabase unindexed-foreign-key advisor
-- finding without changing source or journey semantics.
create index if not exists rental_operational_facts_source_raw_row_idx
  on public.rental_operational_facts (source_raw_row_id);

commit;
