begin;

revoke execute on function public.close_rental_period_from_source(uuid, text, timestamptz, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;

revoke execute on function public.insert_closed_rental_period_from_source(uuid, text, timestamptz, timestamptz, text, text, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

commit;
