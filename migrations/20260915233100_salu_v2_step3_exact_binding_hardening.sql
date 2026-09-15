begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Step 3 hardening: even a later conflict must be bound through an exact authenticated
-- intent. No completed Check-in is associated to a Garage/SISTA HYRAN chain by regnr alone.

create or replace function public.arm_garage_sista_incheckning_intent_v1(
  p_garage_item_id uuid,
  p_decision_id uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.garage_items%rowtype;
  v_decision public.garage_sista_hyran_decisions%rowtype;
  v_intent public.garage_sista_incheckning_intents%rowtype;
  v_existing_final public.garage_sista_incheckningar%rowtype;
  v_already_verified boolean := false;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_garage_item_id is null or p_decision_id is null or p_auth_user_id is null then
    raise exception 'Exakt Garage-, decision- och auth-identitet krävs' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('garage-sista-hyran:' || p_garage_item_id::text));

  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found
     or v_item.source_kind <> 'SALU_PLANERING'
     or v_item.source_salu_flag_id is null
     or v_item.garage_direction is not null
     or v_item.voided_at is not null
     or v_item.handed_off_nybil_id is not null
     or v_item.completed_at is not null then
    raise exception 'Garage-objektet är inte en aktiv exakt SALU_PLANERING-kedja' using errcode = 'P0001';
  end if;

  select * into v_decision
  from public.garage_sista_hyran_decisions d
  where d.decision_id = p_decision_id
    and d.garage_item_id = p_garage_item_id
    and not exists (
      select 1 from public.garage_sista_hyran_decisions newer
      where newer.garage_item_id = d.garage_item_id
        and newer.decision_version > d.decision_version
    );

  if not found then
    raise exception 'SISTA HYRAN-beslutet är inte exakt aktuell version' using errcode = 'P0001';
  end if;

  if v_decision.source_salu_flag_id is distinct from v_item.source_salu_flag_id then
    raise exception 'SISTA HYRAN och Garage har olika SALU-källa' using errcode = 'P0001';
  end if;

  select * into v_existing_final
  from public.garage_sista_incheckningar
  where garage_item_id = p_garage_item_id;
  v_already_verified := found;

  -- Arm even after final verification. If the same chain is intentionally opened in Check-in
  -- again, the exact intent allows the next completed source record to be recorded as a
  -- conflict without a regnr-only heuristic. It can never replace the locked final row.
  insert into public.garage_sista_incheckning_intents(
    garage_item_id,salu_plan_id,source_salu_flag_id,decision_id,decision_version,regnr,
    auth_user_id,armed_at,expires_at
  ) values (
    v_decision.garage_item_id,v_decision.salu_plan_id,v_decision.source_salu_flag_id,
    v_decision.decision_id,v_decision.decision_version,v_decision.regnr,
    p_auth_user_id,v_now,v_now + interval '12 hours'
  )
  on conflict (auth_user_id,decision_id)
  where consumed_at is null and superseded_at is null
  do update set
    armed_at = excluded.armed_at,
    expires_at = excluded.expires_at,
    garage_item_id = excluded.garage_item_id,
    salu_plan_id = excluded.salu_plan_id,
    source_salu_flag_id = excluded.source_salu_flag_id,
    decision_version = excluded.decision_version,
    regnr = excluded.regnr
  returning * into v_intent;

  update public.garage_sista_incheckning_intents i
  set superseded_at = v_now
  where i.auth_user_id = p_auth_user_id
    and i.intent_id <> v_intent.intent_id
    and i.consumed_at is null
    and i.superseded_at is null
    and pg_catalog.upper(pg_catalog.replace(pg_catalog.btrim(i.regnr),' ','')) =
        pg_catalog.upper(pg_catalog.replace(pg_catalog.btrim(v_decision.regnr),' ',''));

  return pg_catalog.jsonb_build_object(
    'armed', true,
    'alreadyVerified', v_already_verified,
    'intentId', v_intent.intent_id,
    'garageItemId', v_intent.garage_item_id,
    'decisionId', v_intent.decision_id,
    'decisionVersion', v_intent.decision_version,
    'expiresAt', v_intent.expires_at,
    'sistaIncheckningId', case when v_already_verified then v_existing_final.sista_incheckning_id else null end,
    'lockedCheckinId', case when v_already_verified then v_existing_final.checkin_id else null end
  );
end;
$$;

create or replace function public.verify_garage_sista_incheckning_from_checkin_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_intent_count integer := 0;
  v_intent public.garage_sista_incheckning_intents%rowtype;
  v_decision public.garage_sista_hyran_decisions%rowtype;
  v_final public.garage_sista_incheckningar%rowtype;
  v_norm_reg text := pg_catalog.upper(pg_catalog.replace(pg_catalog.btrim(coalesce(new.regnr,'')),' ',''));
begin
  if new.status is distinct from 'COMPLETED' or new.completed_at is null or new.id is null or v_norm_reg = '' then
    return new;
  end if;

  if new.completed_by is null then
    return new;
  end if;

  -- Exact intent is mandatory. regnr only confirms that the source record is the vehicle
  -- carried by that already-bound decision; it never chooses the Garage/decision chain.
  select count(*) into v_intent_count
  from public.garage_sista_incheckning_intents i
  join public.garage_sista_hyran_decisions d on d.decision_id = i.decision_id
  join public.garage_items g on g.garage_item_id = i.garage_item_id
  where i.auth_user_id = new.completed_by
    and i.consumed_at is null
    and i.superseded_at is null
    and i.armed_at <= new.completed_at
    and i.expires_at >= new.completed_at
    and pg_catalog.upper(pg_catalog.replace(pg_catalog.btrim(i.regnr),' ','')) = v_norm_reg
    and d.garage_item_id = i.garage_item_id
    and d.decision_version = i.decision_version
    and not exists (
      select 1 from public.garage_sista_hyran_decisions newer
      where newer.garage_item_id = d.garage_item_id
        and newer.decision_version > d.decision_version
    )
    and g.source_kind = 'SALU_PLANERING'
    and g.garage_direction is null
    and g.voided_at is null
    and g.handed_off_nybil_id is null
    and g.completed_at is null;

  if v_intent_count <> 1 then
    return new;
  end if;

  select i.* into v_intent
  from public.garage_sista_incheckning_intents i
  join public.garage_sista_hyran_decisions d on d.decision_id = i.decision_id
  join public.garage_items g on g.garage_item_id = i.garage_item_id
  where i.auth_user_id = new.completed_by
    and i.consumed_at is null
    and i.superseded_at is null
    and i.armed_at <= new.completed_at
    and i.expires_at >= new.completed_at
    and pg_catalog.upper(pg_catalog.replace(pg_catalog.btrim(i.regnr),' ','')) = v_norm_reg
    and d.garage_item_id = i.garage_item_id
    and d.decision_version = i.decision_version
    and not exists (
      select 1 from public.garage_sista_hyran_decisions newer
      where newer.garage_item_id = d.garage_item_id
        and newer.decision_version > d.decision_version
    )
    and g.source_kind = 'SALU_PLANERING'
    and g.garage_direction is null
    and g.voided_at is null
    and g.handed_off_nybil_id is null
    and g.completed_at is null
  limit 1;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('garage-sista-hyran:' || v_intent.garage_item_id::text));

  select * into v_decision
  from public.garage_sista_hyran_decisions d
  where d.decision_id = v_intent.decision_id
    and d.garage_item_id = v_intent.garage_item_id
    and d.decision_version = v_intent.decision_version
    and not exists (
      select 1 from public.garage_sista_hyran_decisions newer
      where newer.garage_item_id = d.garage_item_id
        and newer.decision_version > d.decision_version
    );

  if not found then
    return new;
  end if;

  if new.completed_at < v_decision.decided_at then
    insert into public.garage_sista_incheckning_conflicts(
      garage_item_id,decision_id,locked_sista_incheckning_id,conflicting_checkin_id,
      regnr,checkin_completed_at,conflict_reason,source_provenance
    ) values (
      v_decision.garage_item_id,v_decision.decision_id,null,new.id,new.regnr,new.completed_at,
      'CHECKIN_BEFORE_SISTA_HYRAN_DECISION',
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'sourceOwner','CHECKIN','sourceEntity','checkins','sourceRecordId',new.id,
        'completedBy',new.completed_by,'checkerName',new.checker_name,'checkerEmail',new.checker_email,
        'verificationIntentId',v_intent.intent_id
      ))
    ) on conflict (decision_id,conflicting_checkin_id,conflict_reason) do nothing;

    update public.garage_sista_incheckning_intents
    set consumed_at = pg_catalog.clock_timestamp(), consumed_checkin_id = new.id
    where intent_id = v_intent.intent_id and consumed_at is null;
    return new;
  end if;

  select * into v_final
  from public.garage_sista_incheckningar
  where garage_item_id = v_decision.garage_item_id;

  if found then
    if v_final.checkin_id <> new.id then
      insert into public.garage_sista_incheckning_conflicts(
        garage_item_id,decision_id,locked_sista_incheckning_id,conflicting_checkin_id,
        regnr,checkin_completed_at,conflict_reason,source_provenance
      ) values (
        v_final.garage_item_id,v_final.decision_id,v_final.sista_incheckning_id,new.id,
        new.regnr,new.completed_at,'LATER_COMPLETED_CHECKIN_AFTER_LOCK',
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'sourceOwner','CHECKIN','sourceEntity','checkins','sourceRecordId',new.id,
          'completedBy',new.completed_by,'checkerName',new.checker_name,'checkerEmail',new.checker_email,
          'verificationIntentId',v_intent.intent_id
        ))
      ) on conflict (decision_id,conflicting_checkin_id,conflict_reason) do nothing;
    end if;

    update public.garage_sista_incheckning_intents
    set consumed_at = pg_catalog.clock_timestamp(), consumed_checkin_id = new.id
    where intent_id = v_intent.intent_id and consumed_at is null;
    return new;
  end if;

  insert into public.garage_sista_incheckningar(
    garage_item_id,salu_plan_id,source_salu_flag_id,decision_id,decision_version,
    checkin_id,regnr,final_checkin_completed_at,checkin_completed_by,checkin_checker_name,
    checkin_checker_email,verification_intent_id,verified_at,source_provenance
  ) values (
    v_decision.garage_item_id,v_decision.salu_plan_id,v_decision.source_salu_flag_id,
    v_decision.decision_id,v_decision.decision_version,new.id,new.regnr,new.completed_at,
    new.completed_by,new.checker_name,new.checker_email,v_intent.intent_id,pg_catalog.clock_timestamp(),
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'sourceOwner','CHECKIN','sourceEntity','checkins','sourceRecordId',new.id,
      'sourceStatus',new.status,'completedAt',new.completed_at,'completedBy',new.completed_by,
      'checkerName',new.checker_name,'checkerEmail',new.checker_email,
      'verificationIntentId',v_intent.intent_id
    ))
  )
  on conflict do nothing
  returning * into v_final;

  if v_final.sista_incheckning_id is not null then
    update public.garage_sista_incheckning_intents
    set consumed_at = pg_catalog.clock_timestamp(), consumed_checkin_id = new.id
    where intent_id = v_intent.intent_id and consumed_at is null;
  end if;

  return new;
end;
$$;

comment on function public.arm_garage_sista_incheckning_intent_v1(uuid,uuid,uuid) is
  'Exact authenticated Step 3 provenance. Arms the exact current decision even after final verification so a later completed Check-in can only be classified as conflict through the same exact chain.';
comment on function public.verify_garage_sista_incheckning_from_checkin_v1() is
  'Consumes exactly one authenticated decision-bound intent. regnr is validation only, never chain selection. First eligible completed Check-in locks SISTA INCHECKNING; later exact-chain Check-ins become conflicts without overwrite.';

commit;
