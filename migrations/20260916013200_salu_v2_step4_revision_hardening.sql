begin;

set local lock_timeout='5s';
set local statement_timeout='30s';

-- A BUHS source-set may change after AVVECKLA handoff but before terminal completion.
-- Preserve the one AVVECKLA case and append a new exact handoff revision bound to the new BUHS verification.
alter table public.garage_salu_v2_avveckla_handoffs
  drop constraint if exists garage_salu_v2_avveckla_handoffs_sista_incheckning_id_key,
  drop constraint if exists garage_salu_v2_avveckla_handoffs_garage_item_id_key,
  drop constraint if exists garage_salu_v2_avveckla_handoffs_avveckla_case_id_key;

alter table public.garage_salu_v2_avveckla_handoffs
  add column if not exists handoff_revision integer not null default 1 check (handoff_revision>0),
  add column if not exists supersedes_handoff_id uuid references public.garage_salu_v2_avveckla_handoffs(salu_v2_handoff_id) on delete restrict;

alter table public.garage_salu_v2_avveckla_handoffs
  add constraint garage_salu_v2_avveckla_handoffs_final_revision_key unique(sista_incheckning_id,handoff_revision);

create index garage_salu_v2_avveckla_handoff_current_idx
  on public.garage_salu_v2_avveckla_handoffs(sista_incheckning_id,handoff_revision desc);

-- Correct deterministic distinct input normalization and keep all original authorization/identity checks.
create or replace function public.verify_salu_v2_buhs_v1(
  p_sista_incheckning_id uuid,p_expected_damage_ids uuid[],p_idempotency_key text,p_actor_email text,p_auth_user_id uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_final public.garage_sista_incheckningar%rowtype; v_item public.garage_items%rowtype; v_employee_id uuid; v_function text;
  v_current_ids uuid[]; v_expected_ids uuid[]; v_hash text; v_existing public.salu_v2_buhs_verifications%rowtype;
  v_snapshot public.salu_v2_buhs_verifications%rowtype; v_revision integer; v_damage_id uuid;
begin
  if p_auth_user_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'AUTH_AND_IDEMPOTENCY_REQUIRED' using errcode='22023'; end if;
  select * into v_final from public.garage_sista_incheckningar where sista_incheckning_id=p_sista_incheckning_id for share;
  if not found then raise exception 'STEP3_FINAL_REQUIRED' using errcode='P0002'; end if;
  select * into v_item from public.garage_items where garage_item_id=v_final.garage_item_id for share;
  if not found or v_item.source_kind<>'SALU_PLANERING' or v_item.garage_direction is not null or v_item.voided_at is not null or v_item.completed_at is not null then
    raise exception 'SALU_STEP3_CHAIN_NOT_ACTIVE' using errcode='P0001'; end if;
  v_employee_id:=public.resolve_active_employee_identity_v1(p_actor_email);
  v_function:=public.actor_can_verify_salu_buhs_v1(v_employee_id,clock_timestamp());
  if v_function is null then raise exception 'BUHS_VERIFY_FORBIDDEN' using errcode='42501'; end if;
  select coalesce(array_agg(s.x order by s.x::text),'{}'::uuid[]) into v_expected_ids
    from (select distinct x from unnest(coalesce(p_expected_damage_ids,'{}'::uuid[])) x) s;
  v_current_ids:=public.current_salu_buhs_source_ids_v1(v_final.sista_incheckning_id);
  if cardinality(v_expected_ids)<>cardinality(coalesce(p_expected_damage_ids,'{}'::uuid[])) or v_expected_ids is distinct from v_current_ids then
    raise exception 'BUHS_SOURCE_SET_MISMATCH' using errcode='P0001'; end if;
  v_hash:=public.salu_buhs_source_set_hash_v1(v_current_ids);
  perform pg_advisory_xact_lock(hashtextextended('SALU_V2_BUHS:'||v_final.sista_incheckning_id::text,0));
  select * into v_existing from public.salu_v2_buhs_verifications where sista_incheckning_id=v_final.sista_incheckning_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_existing.source_set_hash=v_hash and v_existing.verified_by_employee_id=v_employee_id and v_existing.verified_by_auth_user_id=p_auth_user_id then
      return to_jsonb(v_existing)||jsonb_build_object('idempotentReplay',true); end if;
    raise exception 'BUHS_IDEMPOTENCY_CONFLICT' using errcode='P0001';
  end if;
  select coalesce(max(revision_no),0)+1 into v_revision from public.salu_v2_buhs_verifications where sista_incheckning_id=v_final.sista_incheckning_id;
  insert into public.salu_v2_buhs_verifications(sista_incheckning_id,garage_item_id,salu_plan_id,source_salu_flag_id,decision_id,decision_version,
    checkin_id,final_checkin_completed_at,revision_no,idempotency_key,source_row_count,source_set_hash,total_result,
    verified_by_employee_id,verified_by_auth_user_id,verified_business_function,verified_by_email)
  values(v_final.sista_incheckning_id,v_final.garage_item_id,v_final.salu_plan_id,v_final.source_salu_flag_id,v_final.decision_id,v_final.decision_version,
    v_final.checkin_id,v_final.final_checkin_completed_at,v_revision,btrim(p_idempotency_key),cardinality(v_current_ids),v_hash,'PASS',
    v_employee_id,p_auth_user_id,v_function,nullif(lower(btrim(coalesce(p_actor_email,''))),'')) returning * into v_snapshot;
  foreach v_damage_id in array v_current_ids loop
    insert into public.salu_v2_buhs_verification_rows(buhs_verification_id,damage_id,disposition) values(v_snapshot.buhs_verification_id,v_damage_id,'PASS');
  end loop;
  return to_jsonb(v_snapshot)||jsonb_build_object('idempotentReplay',false);
end;$$;

create or replace function public.start_salu_v2_avveckla_v1(
  p_sista_incheckning_id uuid,p_buhs_verification_id uuid,p_actor uuid,p_actor_email text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_final public.garage_sista_incheckningar%rowtype; v_snapshot public.salu_v2_buhs_verifications%rowtype; v_item public.garage_items%rowtype;
  v_case public.garage_avveckla_cases%rowtype; v_latest public.garage_salu_v2_avveckla_handoffs%rowtype; v_handoff public.garage_salu_v2_avveckla_handoffs%rowtype;
  v_period public.vehicle_journey_periods%rowtype; v_period_count integer; v_event_id uuid; v_regnr text; v_revision integer:=1;
begin
  if p_actor is null then raise exception 'ACTOR_REQUIRED' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('SALU_V2_AVVECKLA:'||p_sista_incheckning_id::text,0));
  select * into v_final from public.garage_sista_incheckningar where sista_incheckning_id=p_sista_incheckning_id for share;
  if not found then raise exception 'STEP3_FINAL_REQUIRED' using errcode='P0002'; end if;
  v_snapshot:=public.assert_salu_v2_buhs_snapshot_current_v1(p_buhs_verification_id);
  if v_snapshot.sista_incheckning_id<>v_final.sista_incheckning_id or v_snapshot.garage_item_id<>v_final.garage_item_id
    or v_snapshot.salu_plan_id<>v_final.salu_plan_id or v_snapshot.source_salu_flag_id<>v_final.source_salu_flag_id
    or v_snapshot.decision_id<>v_final.decision_id or v_snapshot.decision_version<>v_final.decision_version
    or v_snapshot.checkin_id<>v_final.checkin_id or v_snapshot.final_checkin_completed_at<>v_final.final_checkin_completed_at then
    raise exception 'STEP3_BUHS_IDENTITY_MISMATCH' using errcode='P0001'; end if;
  select * into v_item from public.garage_items where garage_item_id=v_final.garage_item_id for update;
  if not found or v_item.source_kind<>'SALU_PLANERING' or v_item.source_salu_flag_id<>v_final.source_salu_flag_id or v_item.garage_direction is not null
    or v_item.voided_at is not null or v_item.handed_off_nybil_id is not null or v_item.completed_at is not null then
    raise exception 'SALU_PLANERING_DIRECTIONLESS_REQUIRED' using errcode='P0001'; end if;

  select * into v_latest from public.garage_salu_v2_avveckla_handoffs
    where sista_incheckning_id=v_final.sista_incheckning_id order by handoff_revision desc limit 1 for update;
  if found then
    if v_latest.buhs_verification_id=p_buhs_verification_id then return to_jsonb(v_latest)||jsonb_build_object('idempotentReplay',true); end if;
    select * into v_case from public.garage_avveckla_cases where avveckla_case_id=v_latest.avveckla_case_id for update;
    if not found or v_case.status<>'OPEN' then raise exception 'TERMINAL_HISTORY_ALREADY_ESTABLISHED' using errcode='P0001'; end if;
    if v_latest.garage_item_id<>v_final.garage_item_id or v_latest.salu_plan_id<>v_final.salu_plan_id or v_latest.decision_id<>v_final.decision_id
      or v_latest.decision_version<>v_final.decision_version or v_latest.checkin_id<>v_final.checkin_id then raise exception 'EXISTING_HANDOFF_CHAIN_CONFLICT' using errcode='P0001'; end if;
    v_revision:=v_latest.handoff_revision+1;
    insert into public.garage_salu_v2_avveckla_handoffs(sista_incheckning_id,buhs_verification_id,garage_item_id,salu_plan_id,source_salu_flag_id,
      decision_id,decision_version,checkin_id,final_checkin_completed_at,avveckla_case_id,journey_period_id,handed_off_by,handed_off_by_email,handoff_revision,supersedes_handoff_id)
    values(v_final.sista_incheckning_id,v_snapshot.buhs_verification_id,v_final.garage_item_id,v_final.salu_plan_id,v_final.source_salu_flag_id,
      v_final.decision_id,v_final.decision_version,v_final.checkin_id,v_final.final_checkin_completed_at,v_latest.avveckla_case_id,v_latest.journey_period_id,p_actor,
      nullif(lower(btrim(coalesce(p_actor_email,''))),''),v_revision,v_latest.salu_v2_handoff_id) returning * into v_handoff;
    return to_jsonb(v_handoff)||jsonb_build_object('idempotentReplay',false,'caseReused',true);
  end if;

  v_regnr:=upper(regexp_replace(v_final.regnr,'\s+','','g'));
  select count(*) into v_period_count from public.vehicle_journey_periods p where upper(regexp_replace(p.regnr,'\s+','','g'))=v_regnr and p.ended_at is null;
  if v_period_count<>1 then raise exception 'SALU_AVVECKLA_REQUIRES_EXACTLY_ONE_OPEN_LAYER1_PERIOD' using errcode='P0001'; end if;
  select * into v_period from public.vehicle_journey_periods p where upper(regexp_replace(p.regnr,'\s+','','g'))=v_regnr and p.ended_at is null for update;
  if exists(select 1 from public.garage_avveckla_cases c where c.garage_item_id=v_item.garage_item_id) then raise exception 'AVVECKLA_CASE_ALREADY_EXISTS_WITHOUT_SALU_HANDOFF' using errcode='P0001'; end if;
  insert into public.garage_avveckla_cases(garage_item_id,regnr,reason,started_by,started_by_email)
  values(v_item.garage_item_id,v_regnr,'SALU_V2_STEP4',p_actor,nullif(lower(btrim(coalesce(p_actor_email,''))),'')) returning * into v_case;
  insert into public.garage_salu_v2_avveckla_handoffs(sista_incheckning_id,buhs_verification_id,garage_item_id,salu_plan_id,source_salu_flag_id,
    decision_id,decision_version,checkin_id,final_checkin_completed_at,avveckla_case_id,journey_period_id,handed_off_by,handed_off_by_email,handoff_revision)
  values(v_final.sista_incheckning_id,v_snapshot.buhs_verification_id,v_final.garage_item_id,v_final.salu_plan_id,v_final.source_salu_flag_id,
    v_final.decision_id,v_final.decision_version,v_final.checkin_id,v_final.final_checkin_completed_at,v_case.avveckla_case_id,v_period.period_id,p_actor,
    nullif(lower(btrim(coalesce(p_actor_email,''))),''),1) returning * into v_handoff;
  insert into public.garage_avveckla_events(avveckla_case_id,garage_item_id,regnr,event_type,event_key,actor_id,actor_email,actor_source,payload,salu_v2_handoff_id)
  values(v_case.avveckla_case_id,v_item.garage_item_id,v_regnr,'AVVECKLA_STARTED','garage-avveckla:'||v_case.avveckla_case_id::text||':STARTED',p_actor,
    nullif(lower(btrim(coalesce(p_actor_email,''))),''),'MANUELL',jsonb_build_object('reason','SALU_V2_STEP4','saluV2HandoffId',v_handoff.salu_v2_handoff_id),v_handoff.salu_v2_handoff_id)
  returning event_id into v_event_id;
  return to_jsonb(v_handoff)||jsonb_build_object('started_event_id',v_event_id,'idempotentReplay',false,'caseReused',false);
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
  select * into v_handoff from public.garage_salu_v2_avveckla_handoffs where garage_item_id=p_garage_item_id order by handoff_revision desc limit 1 for share;
  if not found then raise exception 'SALU_V2_AVVECKLA_HANDOFF_REQUIRED' using errcode='P0001'; end if;
  select * into v_case from public.garage_avveckla_cases where avveckla_case_id=v_handoff.avveckla_case_id and garage_item_id=v_item.garage_item_id for update;
  if not found then raise exception 'AVVECKLA_CASE_REQUIRED' using errcode='P0001'; end if;

  -- Historical terminal fact wins on exact retry; later BUHS imports cannot rewrite completed history.
  if v_case.status='COMPLETED' then
    select * into v_event from public.garage_avveckla_events where event_id=v_case.completion_event_id;
    if found and v_event.event_type=p_event_type then
      select fact_id into v_membership_fact_id from public.fleet_membership_facts where source_system='GARAGE_AVVECKLA' and source_entity='garage_avveckla_events' and source_event_id=v_event.event_id::text;
      return jsonb_build_object('garage_item_id',v_item.garage_item_id,'avveckla_case_id',v_case.avveckla_case_id,'completion_event_id',v_event.event_id,
        'membership_fact_id',v_membership_fact_id,'journey_period_id',(v_event.payload->>'journeyPeriodId')::uuid,'completed_at',v_case.completed_at,'idempotentReplay',true);
    end if;
    raise exception 'SALU_V2_TERMINAL_CONFLICT' using errcode='P0001';
  end if;

  perform public.assert_salu_v2_buhs_snapshot_current_v1(v_handoff.buhs_verification_id);
  select * into v_final from public.garage_sista_incheckningar where sista_incheckning_id=v_handoff.sista_incheckning_id for share;
  if not found or v_final.garage_item_id<>v_handoff.garage_item_id or v_final.salu_plan_id<>v_handoff.salu_plan_id
    or v_final.source_salu_flag_id<>v_handoff.source_salu_flag_id or v_final.decision_id<>v_handoff.decision_id
    or v_final.decision_version<>v_handoff.decision_version or v_final.checkin_id<>v_handoff.checkin_id
    or v_final.final_checkin_completed_at<>v_handoff.final_checkin_completed_at then raise exception 'SALU_V2_STEP3_HANDOFF_MISMATCH' using errcode='P0001'; end if;
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
      'saluV2HandoffId',v_handoff.salu_v2_handoff_id,'handoffRevision',v_handoff.handoff_revision,'sistaIncheckningId',v_final.sista_incheckning_id,'buhsVerificationId',v_handoff.buhs_verification_id),v_handoff.salu_v2_handoff_id)
  returning event_id into v_event_id;
  v_membership_fact_id:=public.append_fleet_membership_exit_from_avveckla(v_event_id);
  perform public.close_vehicle_journey_period_from_salu_v2_v1(v_period.period_id,v_period.regnr,p_occurred_at,v_event_id::text,p_actor,nullif(lower(trim(coalesce(p_actor_email,''))),''));
  update public.garage_avveckla_cases set status='COMPLETED',completed_at=p_occurred_at,completed_by=p_actor,completion_event_id=v_event_id,updated_at=clock_timestamp() where avveckla_case_id=v_case.avveckla_case_id;
  update public.garage_items set completed_at=p_occurred_at,completed_by=p_actor,completion_event_id=v_event_id,updated_at=clock_timestamp(),updated_by=p_actor where garage_item_id=v_item.garage_item_id;
  return jsonb_build_object('garage_item_id',v_item.garage_item_id,'avveckla_case_id',v_case.avveckla_case_id,'regnr',v_regnr,'method',v_method,
    'completion_event_id',v_event_id,'membership_fact_id',v_membership_fact_id,'journey_period_id',v_period.period_id,'completed_at',p_occurred_at,'idempotentReplay',false);
end;$$;

comment on column public.garage_salu_v2_avveckla_handoffs.handoff_revision is 'Append-only binding revision. New BUHS source-set after handoff requires new BUHS verification + new handoff revision on the same AVVECKLA case.';

commit;
