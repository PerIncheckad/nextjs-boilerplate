begin;

revoke execute on function public.try_write_through_nybil_period(uuid, text, boolean, timestamptz, text, boolean)
  from public, anon, authenticated, service_role;

revoke execute on function public.try_write_through_vehicle_status_period(bigint, text, text, text, timestamptz, text, text, text)
  from public, anon, authenticated, service_role;

revoke execute on function public.try_write_through_checkin_downtime_period(uuid, text, text, timestamptz, jsonb, uuid, text)
  from public, anon, authenticated, service_role;

revoke execute on function public.close_vehicle_journey_period_from_source(uuid, text, timestamptz, text, text, text, uuid, text, text)
  from public, anon, authenticated, service_role;

commit;
