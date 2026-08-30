-- Garage / UTVECKLA holding period for planned new vehicles.
-- Stored per Garage item. Existing rows remain null until explicitly selected.
-- Allowed business values are locked to 4, 6, 9, 12, 18 or 24 months.

alter table public.garage_items
  add column if not exists holding_period_months integer;

alter table public.garage_items
  drop constraint if exists garage_items_holding_period_months_check;

alter table public.garage_items
  add constraint garage_items_holding_period_months_check
  check (holding_period_months is null or holding_period_months in (4, 6, 9, 12, 18, 24));

comment on column public.garage_items.holding_period_months is
  'Planned holding period in months for UTVECKLA / IN vehicles. Allowed: 4, 6, 9, 12, 18, 24.';
