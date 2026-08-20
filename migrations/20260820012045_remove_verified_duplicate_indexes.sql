drop index if exists public.damages_regnr_idx;
alter table public.vehicles drop constraint if exists vehicles_regnr_key;
