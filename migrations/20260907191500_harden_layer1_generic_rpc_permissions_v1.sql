begin;

revoke execute on function public.start_vehicle_journey_period(uuid, text, text, timestamptz, text, text, uuid, text)
  from public, anon, authenticated, service_role;

revoke execute on function public.transition_vehicle_journey_state(uuid, text, text, timestamptz, text, text, text, text, text, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;

revoke execute on function public.close_vehicle_journey_period(uuid, text, timestamptz, uuid, text)
  from public, anon, authenticated, service_role;

commit;
