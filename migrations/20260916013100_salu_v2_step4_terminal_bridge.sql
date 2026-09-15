begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- SALU V2 / Step 4 / part 2
-- Reuse existing AVVECKLA cases/readiness/events and the one canonical fleet EXIT adapter.
-- SALU V2 closes exact Layer 1 facts without durationHours. Legacy/generic AVVECKLA stays unchanged.

create or replace function public.close_vehicle_journey_activity_period_from_salu_v2_v1(
  p_activity_period_id uuid,p_regnr text,p_ended_at timestamptz,p_source_record_id text,p_actor_id uuid,p_actor_email text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_activity public.vehicle_journey_activity_periods%rowtype; v_parent public.vehicle_journey_periods%rowtype;
begin
  select * into v_activity from public.vehicle_journey_activity_periods
   where activity_period_id=p_activity_period_id and regnr=p_regnr for update;
  if not found then raise exception 'Journey activity not found for vehicle' using errcode='P0002'; end if;
  if v_activity.ended_at is not null then return to_jsonb(v_activity); end if;
  select * into v_parent from public.vehicle_journey_periods where period_id=v_activity.parent_period_id for update;
  if not found then raise exception 'Parent downtime period not found' using errcode='P0002'; end if;
  if p_ended_at<v_activity.started_at then raise exception 'Activity end cannot be before activity start' using errcode='22007'; end if;
  update public.vehicle_journey_activity_periods set ended_at=p_ended_at,updated_at=now()
   where activity_period_id=p_activity_period_id returning * into v_activity;
  insert into public.vehicle_journey_events(regnr,event_type,event_key,occurred_at,source_system,source_entity,source_record_id,actor_id,actor_source,actor_email,payload)
  values(p_regnr,'ACTIVITY_PERIOD_ENDED','vehicle-activity:'||p_activity_period_id::text||':ACTIVITY_PERIOD_ENDED',p_ended_at,
    'GARAGE_AVVECKLA','garage_avveckla_events',p_source_record_id,p_actor_id,'MANUELL',p_actor_email,
    jsonb_build_object('activityPeriodId',v_activity.activity_period_id,'parentPeriodId',v_activity.parent_period_id,
      'activityType',v_activity.activity_type,'startedAt',v_activity.started_at,'endedAt',p_ended_at,'reasonText',v_activity.reason_text,'calculationOwner','KISTAN'));
  return jsonb_build_object('activity_period_id',v_activity.activity_period_id,'started_at',v_activity.started_at,'ended_at',v_activity.ended_at);
end;$$;

create or replace function public.close_vehicle_journey_period_from_salu_v2_v1(
  p_period_id uuid,p_regnr text,p_ended_at timestamptz,p_source_record_id text,p_actor_id uuid,p_actor_email text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_period public.vehicle_journey_periods%rowtype; v_activity record;
begin
  select * into v_period from public.vehicle_journey_periods where period_id=p_period_id and regnr=p_regnr for update;
  if not found then raise exception 'Period not found for vehicle' using errcode='P0002'; end if;
  if v_period.ended_at is not null then return to_jsonb(v_period); end if;
  if p_ended_at<v_period.started_at then raise exception 'End time cannot be before start time' using errcode='22007'; end if;
  if v_period.period_type='DOWNTIME' then
    for v_activity in select activity_period_id from public.vehicle_journey_activity_periods
      where parent_period_id=v_period.period_id and ended_at is null order by started_at,activity_period_id for update
    loop
      perform public.close_vehicle_journey_activity_period_from_salu_v2_v1(v_activity.activity_period_id,p_regnr,p_ended_at,p_source_record_id,p_actor_id,p_actor_email);
    end loop;
  end if;
  update public.vehicle_journey_periods set ended_at=p_ended_at,updated_at=now() where period_id=p_period_id returning * into v_period;
  insert into public.vehicle_journey_events(regnr,event_type,event_key,occurred_at,source_system,source_entity,source_record_id,actor_id,actor_source,actor_email,payload)
  values(p_regnr,'PERIOD_ENDED','vehicle-period:'||p_period_id::text||':PERIOD_ENDED',p_ended_at,
    'GARAGE_AVVECKLA','garage_avveckla_events',p_source_record_id,p_actor_id,'MANUELL',p_actor_email,
    jsonb_build_object('periodType',v_period.period_type,'startedAt',v_period.started_at,'endedAt',p_ended_at,
      'reasonCode',v_period.reason_code,'reasonText',v_period.reason_text,'calculationOwner','KISTAN'));
  return jsonb_build_object('period_id',v_period.period_id,'period_type',v_period.period_type,'started_at',v_period.started_at,'ended_at',v_period.ended_at);
end;$$;

-- Same canonical EXIT adapter, widened only to accept an exact relational SALU V2 handoff.
create or replace function public.append_fleet_membership_exit_from_avveckla(p_event_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_event public.garage_avveckla_events%rowtype; v_item public.garage_items%rowtype; v_case public.garage_avveckla_cases%rowtype;
  v_handoff public.garage_salu_v2_avveckla_handoffs%rowtype; v_identity_id uuid; v_current record;
  v_existing public.fleet_membership_facts%rowtype; v_t0_live boolean; v_fact_id uuid; v_evidence jsonb; v_salu boolean:=false;
begin
  perform public.lock_fleet_membership_cutover();
  select * into v_event from public.garage_avveckla_events where event_id=p_event_id;
  if not found then raise exception 'INITIAL_EXIT_SOURCE_REJECT: AVVECKLA event does not exist'; end if;
  if v_event.event_type not in ('UT_OVERLAMNING_VERIFIERAD','UT_TRANSPORTOR_HAMTAT_VERIFIERAD','UT_AVSTALLNING_VERIFIERAD') then
    raise exception 'INITIAL_EXIT_SOURCE_REJECT: event is not a canonical terminal AVVECKLA source'; end if;
  if v_event.event_key<>'garage-avveckla:'||v_event.avveckla_case_id::text||':TERMINAL_UT' or nullif(trim(coalesce(v_event.evidence_reference,'')),'') is null then
    raise exception 'INITIAL_EXIT_SOURCE_REJECT: terminal AVVECKLA provenance is invalid'; end if;
  select * into v_item from public.garage_items where garage_item_id=v_event.garage_item_id for update;
  if not found or v_item.voided_at is not null then raise exception 'INITIAL_EXIT_SOURCE_REJECT: Garage source is invalid'; end if;
  select * into v_case from public.garage_avveckla_cases where avveckla_case_id=v_event.avveckla_case_id for update;
  if not found or v_case.garage_item_id<>v_event.garage_item_id or v_case.regnr<>v_event.regnr then raise exception 'INITIAL_EXIT_SOURCE_REJECT: AVVECKLA case/event mismatch'; end if;

  if v_item.garage_direction='UT' then
    if v_event.salu_v2_handoff_id is not null then raise exception 'INITIAL_EXIT_SOURCE_REJECT: legacy UT cannot claim SALU V2 handoff'; end if;
  elsif v_item.source_kind='SALU_PLANERING' and v_item.garage_direction is null and v_event.salu_v2_handoff_id is not null then
    select * into v_handoff from public.garage_salu_v2_avveckla_handoffs where salu_v2_handoff_id=v_event.salu_v2_handoff_id for share;
    if not found or v_handoff.garage_item_id<>v_item.garage_item_id or v_handoff.avveckla_case_id<>v_case.avveckla_case_id then
      raise exception 'INITIAL_EXIT_SOURCE_REJECT: SALU V2 handoff mismatch'; end if;
    perform public.assert_salu_v2_buhs_snapshot_current_v1(v_handoff.buhs_verification_id);
    v_salu:=true;
  else
    raise exception 'INITIAL_EXIT_SOURCE_REJECT: Garage source is invalid';
  end if;

  v_evidence:=jsonb_build_object('garage_avveckla_event_id',v_event.event_id,'garage_item_id',v_event.garage_item_id,
    'avveckla_case_id',v_event.avveckla_case_id,'terminal_event_type',v_event.event_type,'evidence_reference',v_event.evidence_reference,
    'verified_regnr',v_event.regnr,'garage_vin',v_item.vin,'salu_v2_handoff_id',v_event.salu_v2_handoff_id);
  v_identity_id:=public.resolve_fleet_identity_from_verified_source(v_event.regnr,v_item.vin,v_event.occurred_at,
    'GARAGE_AVVECKLA','garage_avveckla_events',v_event.event_id::text,v_event.event_id::text,v_evidence);
  perform pg_advisory_xact_lock(hashtextextended('FLEET_SOURCE_EVENT:GARAGE_AVVECKLA:garage_avveckla_events:'||v_event.event_id::text,0));
  select f.* into v_existing from public.fleet_membership_facts f
    where f.source_system='GARAGE_AVVECKLA' and f.source_entity='garage_avveckla_events' and f.source_event_id=v_event.event_id::text;
  if found then
    if v_existing.identity_id=v_identity_id and v_existing.membership_state='INACTIVE' and v_existing.basis='EXIT'
      and v_existing.effective_at=v_event.occurred_at and v_existing.source_record_id=v_event.event_id::text then return v_existing.fact_id; end if;
    raise exception 'SOURCE_EVENT_CONFLICT: AVVECKLA source event already has another canonical payload';
  end if;
  select * into v_current from public.fleet_membership_current_by_identity c where c.identity_id=v_identity_id;
  if not found then raise exception 'AVVECKLA_EXIT_IDENTITY_NOT_RESOLVED'; end if;
  if v_current.resolution_reason='NO_FACT' then
    select exists(select 1 from public.fleet_membership_bootstrap_batch_status s where s.bootstrap_denominator_eligible) into v_t0_live;
    if v_t0_live then raise exception 'POST_T0_NO_FACT_EXIT_REJECT: EXIT requires an existing ACTIVE canonical head'; end if;
    insert into public.fleet_membership_facts(identity_id,membership_state,basis,effective_at,source_system,source_entity,source_record_id,source_event_id,
      actor_id,actor_source,actor_name,actor_email,evidence,correction_of_fact_id)
    values(v_identity_id,'INACTIVE','EXIT',v_event.occurred_at,'GARAGE_AVVECKLA','garage_avveckla_events',v_event.event_id::text,v_event.event_id::text,
      v_event.actor_id,v_event.actor_source,null,v_event.actor_email,v_evidence||jsonb_build_object('initial_exit_pre_t0',true),null)
    returning fact_id into v_fact_id; return v_fact_id;
  end if;
  if v_current.resolution_reason<>'RESOLVED' then raise exception 'FACT_CONFLICT requires CORRECTION before AVVECKLA EXIT'; end if;
  if v_current.membership_state<>'ACTIVE' then raise exception 'EXIT requires exactly one ACTIVE canonical head'; end if;
  return public.append_fleet_membership_fact(v_identity_id,'INACTIVE','EXIT',v_event.occurred_at,'GARAGE_AVVECKLA','garage_avveckla_events',
    v_event.event_id::text,v_event.event_id::text,v_event.actor_id,v_event.actor_source,null,v_event.actor_email,
    v_evidence||jsonb_build_object('initial_exit_pre_t0',false),array[v_current.membership_fact_id]::uuid[],null);
end;$$;

create or replace function public.complete_salu_v2_avveckla_terminal_v1(
  p_garage_item_id uuid,p_event_type text,p_occurred_at timestamptz,p_evidence_reference text,p_actor uuid,p_actor_email text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_item public.garage_items%rowtype; v_case public.garage_avveckla_cases%rowtype; v_handoff public.garage_salu_v2_avveckla_handoffs%rowtype;
  v_final public.garage_sista_incheckningar%rowtype; v_period public.vehicle_journey_periods%rowtype; v_event public.garage_avveckla_events%rowtype;
  v_event_id uuid; v_membership_fact_id uuid; v_method text; v_regnr text; v_evidence text:=nullif(trim(coalesce(p_evidence_reference,'')),'');
begin
  if p_actor is null or p_occurred_at is null or v_evidence is null then raise exception 'ACTOR_TIME_EVIDENCE_REQUIRED' using errcode='22023'; end if;
  v_method:=case p_event_type when 'UT_OVERLAMNING_VERIFIERAD' then 'EGEN_LEVERANS' when 'UT_TRANSPORTOR_HAMTAT_VERIFIERAD' then 'EXTERN_TRANSPORT' when 'UT_AVSTALLNING_VERIFIERAD' then 'AVSTALLNING' else null end;
  if v_method is null then raise exception 'Ogiltig terminal AVVECKLA-händelse' using errcode='22023'; end if;
  perform public.lock_fleet_membership_cutover();
  select * into v_item from public.garage_items where garage_item_id=p_garage_item_id for update;
  if not found or v_item.source_kind<>'SALU_PLANERING' or v_item.garage_direction is not null or v_item.voided_at is not null then raise exception 'SALU_V2_DIRECTIONLESS_SOURCE_REQUIRED' using errcode='P0001'; end if;
  select * into v_handoff from public.garage_salu_v2_avveckla_handoffs where garage_item_id=p_garage_item_id for share;
  if not found then raise exception 'SALU_V2_AVVECKLA_HANDOFF_REQUIRED' using errcode='P0001'; end if;
  perform public.assert_salu_v2_buhs_snapshot_current_v1(v_handoff.buhs_verification_id);
  select * into v_final from public.garage_sista_incheckningar where sista_incheckning_id=v_handoff.sista_incheckning_id for share;
  if not found or v_final.garage_item_id<>v_handoff.garage_item_id or v_final.salu_plan_id<>v_handoff.salu_plan_id
    or v_final.source_salu_flag_id<>v_handoff.source_salu_flag_id or v_final.decision_id<>v_handoff.decision_id
    or v_final.decision_version<>v_handoff.decision_version or v_final.checkin_id<>v_handoff.checkin_id
    or v_final.final_checkin_completed_at<>v_handoff.final_checkin_completed_at then raise exception 'SALU_V2_STEP3_HANDOFF_MISMATCH' using errcode='P0001'; end if;
  select * into v_case from public.garage_avveckla_cases where avveckla_case_id=v_handoff.avveckla_case_id and garage_item_id=v_item.garage_item_id for update;
  if not found then raise exception 'AVVECKLA_CASE_REQUIRED' using errcode='P0001'; end if;
  if v_case.status='COMPLETED' then
    select * into v_event from public.garage_avveckla_events where event_id=v_case.completion_event_id;
    if found and v_event.salu_v2_handoff_id=v_handoff.salu_v2_handoff_id and v_event.event_type=p_event_type then
      select fact_id into v_membership_fact_id from public.fleet_membership_facts where source_system='GARAGE_AVVECKLA' and source_entity='garage_avveckla_events' and source_event_id=v_event.event_id::text;
      return jsonb_build_object('garage_item_id',v_item.garage_item_id,'avveckla_case_id',v_case.avveckla_case_id,'completion_event_id',v_event.event_id,
        'membership_fact_id',v_membership_fact_id,'journey_period_id',v_handoff.journey_period_id,'completed_at',v_case.completed_at,'idempotentReplay',true);
    end if;
    raise exception 'SALU_V2_TERMINAL_CONFLICT' using errcode='P0001';
  end if;
  perform public.assert_garage_avveckla_ready_for_completion(v_item.garage_item_id);
  select * into v_period from public.vehicle_journey_periods where period_id=v_handoff.journey_period_id for update;
  if not found or v_period.ended_at is not null then raise exception 'BOUND_LAYER1_PERIOD_NOT_OPEN' using errcode='P0001'; end if;
  if p_occurred_at<v_period.started_at or p_occurred_at<v_final.final_checkin_completed_at then raise exception 'TERMINAL_TIME_PRECEDES_VERIFIED_SOURCE' using errcode='22007'; end if;
  v_regnr:=upper(regexp_replace(v_final.regnr,'\s+','','g'));
  if upper(regexp_replace(v_period.regnr,'\s+','','g'))<>v_regnr or v_case.regnr<>v_regnr then raise exception 'BOUND_VEHICLE_MISMATCH' using errcode='P0001'; end if;
  insert into public.garage_avveckla_events(avveckla_case_id,garage_item_id,regnr,event_type,event_key,occurred_at,actor_id,actor_email,actor_source,evidence_reference,payload,salu_v2_handoff_id)
  values(v_case.avveckla_case_id,v_item.garage_item_id,v_regnr,p_event_type,'garage-avveckla:'||v_case.avveckla_case_id::text||':TERMINAL_UT',p_occurred_at,p_actor,
    nullif(lower(trim(coalesce(p_actor_email,''))),''),'MANUELL',v_evidence,
    jsonb_build_object('garageItemId',v_item.garage_item_id,'avvecklaCaseId',v_case.avveckla_case_id,'method',v_method,'journeyPeriodId',v_period.period_id,
      'saluV2HandoffId',v_handoff.salu_v2_handoff_id,'sistaIncheckningId',v_final.sista_incheckning_id,'buhsVerificationId',v_handoff.buhs_verification_id),v_handoff.salu_v2_handoff_id)
  returning event_id into v_event_id;
  v_membership_fact_id:=public.append_fleet_membership_exit_from_avveckla(v_event_id);
  perform public.close_vehicle_journey_period_from_salu_v2_v1(v_period.period_id,v_period.regnr,p_occurred_at,v_event_id::text,p_actor,nullif(lower(trim(coalesce(p_actor_email,''))),''));
  update public.garage_avveckla_cases set status='COMPLETED',completed_at=p_occurred_at,completed_by=p_actor,completion_event_id=v_event_id,updated_at=clock_timestamp()
    where avveckla_case_id=v_case.avveckla_case_id;
  update public.garage_items set completed_at=p_occurred_at,completed_by=p_actor,completion_event_id=v_event_id,updated_at=clock_timestamp(),updated_by=p_actor
    where garage_item_id=v_item.garage_item_id;
  return jsonb_build_object('garage_item_id',v_item.garage_item_id,'avveckla_case_id',v_case.avveckla_case_id,'regnr',v_regnr,'method',v_method,
    'completion_event_id',v_event_id,'membership_fact_id',v_membership_fact_id,'journey_period_id',v_period.period_id,'completed_at',p_occurred_at,'idempotentReplay',false);
end;$$;

create or replace function public.book_salu_v2_avveckla_transport_v1(p_garage_item_id uuid,p_booked_at timestamptz,p_booking_reference text,p_actor uuid,p_actor_email text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_handoff public.garage_salu_v2_avveckla_handoffs%rowtype; v_case public.garage_avveckla_cases%rowtype; v_booking public.garage_avveckla_transport_bookings%rowtype; v_final public.garage_sista_incheckningar%rowtype;
begin
  if p_actor is null or p_booked_at is null then raise exception 'ACTOR_AND_BOOKING_TIME_REQUIRED' using errcode='22023'; end if;
  select * into v_handoff from public.garage_salu_v2_avveckla_handoffs where garage_item_id=p_garage_item_id for share;
  if not found then raise exception 'SALU_V2_AVVECKLA_HANDOFF_REQUIRED' using errcode='P0001'; end if;
  perform public.assert_salu_v2_buhs_snapshot_current_v1(v_handoff.buhs_verification_id);
  select * into v_case from public.garage_avveckla_cases where avveckla_case_id=v_handoff.avveckla_case_id and status='OPEN' for update;
  if not found then raise exception 'OPEN_AVVECKLA_CASE_REQUIRED' using errcode='P0001'; end if;
  select * into v_booking from public.garage_avveckla_transport_bookings where avveckla_case_id=v_case.avveckla_case_id;
  if found then return jsonb_build_object('booking_id',v_booking.booking_id,'booked_at',v_booking.booked_at,'deadline_at',v_booking.deadline_at,'existing',true); end if;
  select * into v_final from public.garage_sista_incheckningar where sista_incheckning_id=v_handoff.sista_incheckning_id;
  insert into public.garage_avveckla_transport_bookings(avveckla_case_id,garage_item_id,regnr,booked_at,deadline_at,booked_by,booked_by_email,booking_reference)
  values(v_case.avveckla_case_id,p_garage_item_id,upper(regexp_replace(v_final.regnr,'\s+','','g')),p_booked_at,p_booked_at+interval '5 days',p_actor,
    nullif(lower(trim(coalesce(p_actor_email,''))),''),nullif(trim(coalesce(p_booking_reference,'')),'') ) returning * into v_booking;
  insert into public.garage_avveckla_transport_events(booking_id,avveckla_case_id,garage_item_id,regnr,event_type,event_key,occurred_at,actor_id,actor_email,actor_source,payload)
  values(v_booking.booking_id,v_case.avveckla_case_id,p_garage_item_id,v_booking.regnr,'TRANSPORT_BOKAD','garage-avveckla-transport:'||v_booking.booking_id::text||':BOOKED',
    p_booked_at,p_actor,p_actor_email,'MANUELL',jsonb_build_object('bookingId',v_booking.booking_id,'bookedAt',v_booking.booked_at,'deadlineAt',v_booking.deadline_at));
  return jsonb_build_object('booking_id',v_booking.booking_id,'booked_at',v_booking.booked_at,'deadline_at',v_booking.deadline_at,'existing',false);
end;$$;

create or replace function public.verify_salu_v2_avveckla_extern_transport_v1(p_garage_item_id uuid,p_occurred_at timestamptz,p_evidence_reference text,p_actor uuid,p_actor_email text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_booking public.garage_avveckla_transport_bookings%rowtype; v_result jsonb; v_event_id uuid;
begin
  select * into v_booking from public.garage_avveckla_transport_bookings where garage_item_id=p_garage_item_id for update;
  if not found then raise exception 'Extern transport kräver verifierad TRANSPORT_BOKAD' using errcode='P0001'; end if;
  if v_booking.picked_up_at is not null then
    select jsonb_build_object('completion_event_id',v_booking.pickup_event_id,'transport_booking_id',v_booking.booking_id,'idempotentReplay',true) into v_result;
    return v_result;
  end if;
  if p_occurred_at<v_booking.booked_at then raise exception 'Faktisk hämtning kan inte inträffa före transportbokningen' using errcode='22007'; end if;
  v_result:=public.complete_salu_v2_avveckla_terminal_v1(p_garage_item_id,'UT_TRANSPORTOR_HAMTAT_VERIFIERAD',p_occurred_at,p_evidence_reference,p_actor,p_actor_email);
  v_event_id:=(v_result->>'completion_event_id')::uuid;
  update public.garage_avveckla_transport_bookings set picked_up_at=p_occurred_at,pickup_event_id=v_event_id,updated_at=now() where booking_id=v_booking.booking_id;
  return v_result||jsonb_build_object('transport_booking_id',v_booking.booking_id,'transport_booked_at',v_booking.booked_at,'transport_deadline_at',v_booking.deadline_at);
end;$$;

create or replace function public.verify_salu_v2_avveckla_avstallning_v1(p_garage_item_id uuid,p_occurred_at timestamptz,p_evidence_reference text,p_actor uuid,p_actor_email text)
returns jsonb language sql security definer set search_path=pg_catalog as $$
  select public.complete_salu_v2_avveckla_terminal_v1(p_garage_item_id,'UT_AVSTALLNING_VERIFIERAD',p_occurred_at,p_evidence_reference,p_actor,p_actor_email);
$$;

create or replace function public.verify_salu_v2_avveckla_egen_leverans_with_billing_v1(
  p_garage_item_id uuid,p_occurred_at timestamptz,p_evidence_reference text,p_is_billable boolean,p_from_location text,p_to_location text,
  p_price_class text,p_base_price numeric,p_price numeric,p_price_basis text,p_price_list_id text,p_price_list_version text,p_actor uuid,p_actor_email text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_result jsonb; v_event_id uuid; v_case_id uuid; v_regnr text; v_billing public.billable_driving_events%rowtype;
begin
  if p_is_billable is null then raise exception 'Fakturerbar körning måste anges Ja eller Nej för egen leverans' using errcode='22023'; end if;
  if p_is_billable then
    if length(trim(coalesce(p_from_location,'')))=0 or length(trim(coalesce(p_to_location,'')))=0 or p_price is null or p_price<=0 then raise exception 'Giltiga ekonomifakta krävs för fakturerbar körning' using errcode='22023'; end if;
    if p_price_list_id<>'ET_PRISLISTA' or p_price_list_version<>'2026-01-29' or p_price_basis not in ('ET_MATRIX','OFFERT') then raise exception 'Ogiltig prisgrund/prislista' using errcode='22023'; end if;
  end if;
  v_result:=public.complete_salu_v2_avveckla_terminal_v1(p_garage_item_id,'UT_OVERLAMNING_VERIFIERAD',p_occurred_at,p_evidence_reference,p_actor,p_actor_email);
  v_event_id:=(v_result->>'completion_event_id')::uuid;
  if not p_is_billable then
    if exists(select 1 from public.billable_driving_events where source_event_id=v_event_id) then raise exception 'BILLING_RETRY_CONFLICT' using errcode='P0001'; end if;
    return v_result||jsonb_build_object('billable_driving',false);
  end if;
  select * into v_billing from public.billable_driving_events where source_event_id=v_event_id;
  if found then return v_result||jsonb_build_object('billable_driving',true,'billing_event_id',v_billing.billing_event_id,'billing_status',v_billing.billing_status); end if;
  v_case_id:=(v_result->>'avveckla_case_id')::uuid; v_regnr:=v_result->>'regnr';
  insert into public.billable_driving_events(source_event_id,garage_item_id,avveckla_case_id,regnr,from_location,to_location,price_class,base_price,price,price_basis,
    price_list_id,price_list_version,performed_at,performed_by,performed_by_email)
  values(v_event_id,p_garage_item_id,v_case_id,v_regnr,trim(p_from_location),trim(p_to_location),nullif(trim(coalesce(p_price_class,'')),''),p_base_price,p_price,p_price_basis,
    p_price_list_id,p_price_list_version,p_occurred_at,p_actor,nullif(lower(trim(coalesce(p_actor_email,''))),'')) returning * into v_billing;
  insert into public.billable_driving_event_history(billing_event_id,event_type,event_key,previous_status,status,occurred_at,actor_id,actor_email,payload)
  values(v_billing.billing_event_id,'CREATED','billable-driving:'||v_billing.billing_event_id::text||':CREATED',null,'EJ_FAKTURERAD',p_occurred_at,p_actor,p_actor_email,
    jsonb_build_object('sourceEventId',v_event_id,'regnr',v_regnr,'from',trim(p_from_location),'to',trim(p_to_location),'price',p_price,'priceBasis',p_price_basis));
  return v_result||jsonb_build_object('billable_driving',true,'billing_event_id',v_billing.billing_event_id,'billing_status',v_billing.billing_status);
end;$$;

create or replace view public.salu_v2_avvecklad_current with (security_invoker=true) as
select h.salu_v2_handoff_id,h.sista_incheckning_id,h.buhs_verification_id,h.garage_item_id,h.salu_plan_id,h.source_salu_flag_id,h.decision_id,h.decision_version,
       h.checkin_id,h.final_checkin_completed_at,c.avveckla_case_id,c.completed_at as terminal_completed_at,e.event_id as terminal_event_id,e.event_type,
       f.fact_id as canonical_exit_fact_id,f.membership_state,f.basis
from public.garage_salu_v2_avveckla_handoffs h
join public.garage_avveckla_cases c on c.avveckla_case_id=h.avveckla_case_id and c.status='COMPLETED'
join public.garage_items g on g.garage_item_id=h.garage_item_id and g.completed_at=c.completed_at and g.completion_event_id=c.completion_event_id
join public.garage_avveckla_events e on e.event_id=c.completion_event_id and e.salu_v2_handoff_id=h.salu_v2_handoff_id
join public.fleet_membership_facts f on f.source_system='GARAGE_AVVECKLA' and f.source_entity='garage_avveckla_events'
  and f.source_event_id=e.event_id::text and f.membership_state='INACTIVE' and f.basis='EXIT';

revoke all on function public.close_vehicle_journey_activity_period_from_salu_v2_v1(uuid,text,timestamptz,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.close_vehicle_journey_period_from_salu_v2_v1(uuid,text,timestamptz,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.complete_salu_v2_avveckla_terminal_v1(uuid,text,timestamptz,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.book_salu_v2_avveckla_transport_v1(uuid,timestamptz,text,uuid,text) from public,anon,authenticated;
revoke all on function public.verify_salu_v2_avveckla_extern_transport_v1(uuid,timestamptz,text,uuid,text) from public,anon,authenticated;
revoke all on function public.verify_salu_v2_avveckla_avstallning_v1(uuid,timestamptz,text,uuid,text) from public,anon,authenticated;
revoke all on function public.verify_salu_v2_avveckla_egen_leverans_with_billing_v1(uuid,timestamptz,text,boolean,text,text,text,numeric,numeric,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.book_salu_v2_avveckla_transport_v1(uuid,timestamptz,text,uuid,text) to service_role;
grant execute on function public.verify_salu_v2_avveckla_extern_transport_v1(uuid,timestamptz,text,uuid,text) to service_role;
grant execute on function public.verify_salu_v2_avveckla_avstallning_v1(uuid,timestamptz,text,uuid,text) to service_role;
grant execute on function public.verify_salu_v2_avveckla_egen_leverans_with_billing_v1(uuid,timestamptz,text,boolean,text,text,text,numeric,numeric,text,text,text,uuid,text) to service_role;
revoke all on public.salu_v2_avvecklad_current from public,anon,authenticated;
grant select on public.salu_v2_avvecklad_current to service_role;

comment on function public.close_vehicle_journey_period_from_salu_v2_v1(uuid,text,timestamptz,text,uuid,text) is 'SALU V2 terminal Layer 1 close. Persists source timestamps/provenance only; deliberately no durationHours. Kistan owns later calculations.';
comment on view public.salu_v2_avvecklad_current is 'Read-only ARKIV/AVVECKLAD state requiring completed AVVECKLA, immutable terminal event and canonical GARAGE_AVVECKLA EXIT/INACTIVE.';

commit;
