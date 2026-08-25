begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.checkins
  add column fuel_receipt_status text,
  add column fuel_receipt_missing_reason text;

alter table public.checkins
  add constraint checkins_fuel_receipt_status_v1
  check (
    fuel_receipt_status is null
    or (
      fuel_receipt_status = 'DOCUMENTED'
      and fuel_receipt_missing_reason is null
    )
    or (
      fuel_receipt_status = 'MISSING_WITH_REASON'
      and length(trim(coalesce(fuel_receipt_missing_reason, ''))) > 0
    )
  );

create index checkins_missing_fuel_receipt_completed_at_idx
  on public.checkins (completed_at desc)
  where fuel_receipt_status = 'MISSING_WITH_REASON';

comment on column public.checkins.fuel_receipt_status is
  'Explicit Check-in outcome for a newly registered tankad_nu event: DOCUMENTED or MISSING_WITH_REASON. NULL is retained for legacy/inherited records.';

comment on column public.checkins.fuel_receipt_missing_reason is
  'Required source reason when fuel_receipt_status = MISSING_WITH_REASON. This records the verified exception; it is not an economic interpretation.';

commit;
