begin;

set local lock_timeout='5s';
set local statement_timeout='30s';

create or replace function public.book_salu_v2_avveckla_transport_v1(
  p_garage_item_id uuid,
  p_booked_at timestamptz,
  p_booking_reference text,
  p_actor uuid,
  p_actor_email text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_handoff public.garage_salu_v2_avveckla_handoffs%rowtype;
  v_case public.garage_avveckla_cases%rowtype;
  v_booking public.garage_avveckla_transport_bookings%rowtype;
  v_final public.garage_sista_incheckningar%rowtype;
begin
  if p_actor is null or p_booked_at is null then
    raise exception 'ACTOR_AND_BOOKING_TIME_REQUIRED' using errcode='22023';
  end if;

  select * into v_handoff
  from public.garage_salu_v2_avveckla_handoffs
  where garage_item_id=p_garage_item_id
  order by handoff_revision desc
  limit 1
  for share;

  if not found then raise exception 'SALU_V2_AVVECKLA_HANDOFF_REQUIRED' using errcode='P0001'; end if;
  perform public.assert_salu_v2_buhs_snapshot_current_v1(v_handoff.buhs_verification_id);

  select * into v_case
  from public.garage_avveckla_cases
  where avveckla_case_id=v_handoff.avveckla_case_id and status='OPEN'
  for update;
  if not found then raise exception 'OPEN_AVVECKLA_CASE_REQUIRED' using errcode='P0001'; end if;

  select * into v_booking
  from public.garage_avveckla_transport_bookings
  where avveckla_case_id=v_case.avveckla_case_id;
  if found then
    return jsonb_build_object('booking_id',v_booking.booking_id,'booked_at',v_booking.booked_at,'deadline_at',v_booking.deadline_at,'existing',true);
  end if;

  select * into v_final
  from public.garage_sista_incheckningar
  where sista_incheckning_id=v_handoff.sista_incheckning_id;

  insert into public.garage_avveckla_transport_bookings(
    avveckla_case_id,garage_item_id,regnr,booked_at,deadline_at,booked_by,booked_by_email,booking_reference
  ) values(
    v_case.avveckla_case_id,p_garage_item_id,upper(regexp_replace(v_final.regnr,'\s+','','g')),
    p_booked_at,p_booked_at+interval '5 days',p_actor,
    nullif(lower(trim(coalesce(p_actor_email,''))),''),nullif(trim(coalesce(p_booking_reference,'')),'')
  ) returning * into v_booking;

  insert into public.garage_avveckla_transport_events(
    booking_id,avveckla_case_id,garage_item_id,regnr,event_type,event_key,occurred_at,actor_id,actor_email,actor_source,payload
  ) values(
    v_booking.booking_id,v_case.avveckla_case_id,p_garage_item_id,v_booking.regnr,
    'TRANSPORT_BOKAD','garage-avveckla-transport:'||v_booking.booking_id::text||':BOOKED',p_booked_at,p_actor,p_actor_email,'MANUELL',
    jsonb_build_object('bookingId',v_booking.booking_id,'bookedAt',v_booking.booked_at,'deadlineAt',v_booking.deadline_at,
      'saluV2HandoffId',v_handoff.salu_v2_handoff_id,'handoffRevision',v_handoff.handoff_revision)
  );

  return jsonb_build_object('booking_id',v_booking.booking_id,'booked_at',v_booking.booked_at,'deadline_at',v_booking.deadline_at,'existing',false);
end;$$;

revoke all on function public.book_salu_v2_avveckla_transport_v1(uuid,timestamptz,text,uuid,text) from public,anon,authenticated;
grant execute on function public.book_salu_v2_avveckla_transport_v1(uuid,timestamptz,text,uuid,text) to service_role;

comment on function public.book_salu_v2_avveckla_transport_v1(uuid,timestamptz,text,uuid,text) is
  'SALU V2 transport booking uses only the latest exact handoff revision and requires its BUHS snapshot to remain current.';

commit;
