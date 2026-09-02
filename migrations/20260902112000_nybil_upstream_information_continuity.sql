begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Nybil receives the current upstream procurement/garage context at receipt.
-- The exact Garage source row remains available through source_garage_item_id and
-- is frozen after successful handoff, so a Nybil-side change never rewrites the source history.
alter table public.nybil_inventering
  add column if not exists planning_period text,
  add column if not exists planning_reason text,
  add column if not exists supplier text,
  add column if not exists order_reference text,
  add column if not exists vin text,
  add column if not exists source_regnr text,
  add column if not exists saluort text,
  add column if not exists daily_rate numeric,
  add column if not exists holding_period_months integer,
  add column if not exists ordered_at date,
  add column if not exists calloff_at date,
  add column if not exists confirmation_status text,
  add column if not exists transport_status text,
  add column if not exists planned_delivery_date date,
  add column if not exists planning_note text;

alter table public.nybil_inventering
  drop constraint if exists nybil_inventering_planning_period_check,
  drop constraint if exists nybil_inventering_planning_reason_check,
  drop constraint if exists nybil_inventering_daily_rate_check,
  drop constraint if exists nybil_inventering_holding_period_months_check,
  drop constraint if exists nybil_inventering_confirmation_status_check,
  drop constraint if exists nybil_inventering_transport_status_check;

alter table public.nybil_inventering
  add constraint nybil_inventering_planning_period_check
    check (planning_period is null or planning_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  add constraint nybil_inventering_planning_reason_check
    check (planning_reason is null or planning_reason in ('BEHOV','UTOK','MINSKNING','SALU','SALU_RETUR','ANNAT')),
  add constraint nybil_inventering_daily_rate_check
    check (daily_rate is null or daily_rate >= 0),
  add constraint nybil_inventering_holding_period_months_check
    check (holding_period_months is null or holding_period_months in (4,6,9,12,18,24)),
  add constraint nybil_inventering_confirmation_status_check
    check (confirmation_status is null or confirmation_status in ('PLANERAD','BESTALLD','AVROPAD','AVVAKTAR_BEKRAFTELSE','BEKRAFTAD')),
  add constraint nybil_inventering_transport_status_check
    check (transport_status is null or transport_status in ('EJ_BOKAD','TRANSPORTBOKAD','PA_VAG'));

comment on column public.nybil_inventering.planning_period is 'Current planning period carried from Garage at Nybil receipt; Garage source remains linked separately.';
comment on column public.nybil_inventering.supplier is 'Current supplier value at Nybil receipt; may differ from frozen Garage source after operator correction.';
comment on column public.nybil_inventering.order_reference is 'Current order reference at Nybil receipt; may differ from frozen Garage source after operator correction.';
comment on column public.nybil_inventering.vin is 'Current VIN value at Nybil receipt; may differ from frozen Garage source after operator correction.';
comment on column public.nybil_inventering.daily_rate is 'Current daily rate at Nybil receipt; upstream Garage source remains linked for provenance.';
comment on column public.nybil_inventering.holding_period_months is 'Current holding period at Nybil receipt; upstream Garage source remains linked for provenance.';
comment on column public.nybil_inventering.planning_note is 'Current carried planning/Garage note at Nybil receipt.';

commit;
