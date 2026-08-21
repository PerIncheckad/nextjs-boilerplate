create unique index if not exists vehicle_journey_periods_one_open_type_uidx
  on public.vehicle_journey_periods (regnr, period_type)
  where ended_at is null;
