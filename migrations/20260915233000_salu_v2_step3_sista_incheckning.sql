begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- SALU V2 / Step 3
-- SISTA INCHECKNING is verification of an existing completed Check-in against the exact
-- current SISTA HYRAN decision. It is not a new SALU decision and does not close Garage,
-- start AVVECKLA, create canonical fleet EXIT, set INACTIVE, move to ARKIV or verify BUHS.
--
-- Exact identity is established by a short-lived, authenticated verification intent that
-- freezes garage_item_id + salu_plan_id + source_salu_flag_id + decision_id/version before
-- normal Check-in completion. The completed Check-in remains source-owned by public.checkins.

create table public.garage_sista_incheckning_intents (
  intent_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  salu_plan_id uuid not null references public.salu_plans(plan_id) on delete restrict,
  source_salu_flag_id uuid not null references public.salu_flags(flag_id) on delete restrict,
  decision_id uuid not null references public.garage_sista_hyran_decisions(decision_id) on delete restrict,
  decision_version integer not null check (decision_version > 0),
  regnr text not null,
  auth_user_id uuid not null,
  armed_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_checkin_id uuid references public.checkins(id) on delete restrict,
  superseded_at timestamptz,
  check (expires_at > armed_at),
  check ((consumed_at is null and consumed_checkin_id is null) or (consumed_at is not null and consumed_checkin_id is not null))
);

comment on table public.garage_sista_incheckning_intents is
  'Technical authenticated handoff provenance for Step 3. It is not business truth. It prevents regnr-only/latest-checkin binding by arming one exact SISTA HYRAN decision for the authenticated Check-in operator.';

create unique index garage_sista_incheckning_intents_pending_uidx
  on public.garage_sista_incheckning_intents(auth_user_id, decision_id)
  where consumed_at is null and superseded_at is null;

create index garage_sista_incheckning_intents_match_idx
  on public.garage_sista_incheckning_intents(auth_user_id, regnr, armed_at desc)
  where consumed_at is null and superseded_at is null;

create table public.garage_sista_incheckningar (
  sista_incheckning_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  salu_plan_id uuid not null references public.salu_plans(plan_id) on delete restrict,
  source_salu_flag_id uuid not null references public.salu_flags(flag_id) on delete restrict,
  decision_id uuid not null references public.garage_sista_hyran_decisions(decision_id) on delete restrict,
  decision_version integer not null check (decision_version > 0),
  checkin_id uuid not null references public.checkins(id) on delete restrict,
  regnr text not null,
  final_checkin_completed_at timestamptz not null,
  checkin_completed_by uuid,
  checkin_checker_name text,
  checkin_checker_email text,
  verification_intent_id uuid not null references public.garage_sista_incheckning_intents(intent_id) on delete restrict,
  verified_at timestamptz not null default clock_timestamp(),
  source_provenance jsonb not null default '{}'::jsonb,
  unique (garage_item_id),
  unique (decision_id),
  unique (checkin_id)
);

comment on table public.garage_sista_incheckningar is
  'Append-only verified SISTA INCHECKNING link. Freezes the exact completed Check-in and exact SISTA HYRAN decision. Garage remains open; no terminal lifecycle effect is implied.';
comment on column public.garage_sista_incheckningar.final_checkin_completed_at is
  'Exact checkins.completed_at frozen at verification. This is the future Step 4 start anchor; Step 3 does not implement a stillestånd engine.';

create index garage_sista_incheckningar_regnr_idx
  on public.garage_sista_incheckningar(regnr, final_checkin_completed_at desc);

create table public.garage_sista_incheckning_conflicts (
  conflict_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  decision_id uuid not null references public.garage_sista_hyran_decisions(decision_id) on delete restrict,
  locked_sista_incheckning_id uuid references public.garage_sista_incheckningar(sista_incheckning_id) on delete restrict,
  conflicting_checkin_id uuid not null references public.checkins(id) on delete restrict,
  regnr text not null,
  checkin_completed_at timestamptz not null,
  conflict_reason text not null check (conflict_reason in ('CHECKIN_BEFORE_SISTA_HYRAN_DECISION','LATER_COMPLETED_CHECKIN_AFTER_LOCK')),
  detected_at timestamptz not null default clock_timestamp(),
  source_provenance jsonb not null default '{}'::jsonb,
  unique (decision_id, conflicting_checkin_id, conflict_reason)
);

comment on table public.garage_sista_incheckning_conflicts is
  'Append-only Step 3 exception evidence. A second/later completed Check-in never overwrites the locked SISTA INCHECKNING source record.';

create or replace function public.reject_garage_sista_incheckning_history_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'SISTA INCHECKNING history is append-only' using errcode = 'P0001';
end;
$$;

create trigger garage_sista_incheckningar_append_only
before update or delete on public.garage_sista_incheckningar
for each row execute function public.reject_garage_sista_incheckning_history_mutation_v1();

create trigger garage_sista_incheckning_conflicts_append_only
before update or delete on public.garage_sista_incheckning_conflicts
for each row execute function public.reject_garage_sista_incheckning_history_mutation_v1();

create or replace view public.garage_sista_incheckning_current
with (security_invoker = true)
as
select
  f.sista_incheckning_id,
  f.garage_item_id,
  f.salu_plan_id,
  f.source_salu_flag_id,
  f.decision_id,
  f.decision_version,
  f.checkin_id,
  f.regnr,
  f.final_checkin_completed_at,
  f.checkin_completed_by,
  f.checkin_checker_name,
  f.checkin_checker_email,
  f.verification_intent_id,
  f.verified_at,
  f.source_provenance
from public.garage_sista_incheckningar f;

comment on view public.garage_sista_incheckning_current is
  'Step 3 canonical read contract. At most one row exists per Garage/SISTA HYRAN chain because garage_item_id is unique.';

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

  if found then
    return pg_catalog.jsonb_build_object(
      'armed', false,
      'alreadyVerified', true,
      'sistaIncheckningId', v_existing_final.sista_incheckning_id,
      'checkinId', v_existing_final.checkin_id,
      'finalCheckinCompletedAt', v_existing_final.final_checkin_completed_at
    );
  end if;

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
    'alreadyVerified', false,
    'intentId', v_intent.intent_id,
    'garageItemId', v_intent.garage_item_id,
    'decisionId', v_intent.decision_id,
    'decisionVersion', v_intent.decision_version,
    'expiresAt', v_intent.expires_at
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
  v_locked_count integer := 0;
  v_locked public.garage_sista_incheckningar%rowtype;
  v_intent_count integer := 0;
  v_intent public.garage_sista_incheckning_intents%rowtype;
  v_decision public.garage_sista_hyran_decisions%rowtype;
  v_final public.garage_sista_incheckningar%rowtype;
  v_norm_reg text := pg_catalog.upper(pg_catalog.replace(pg_catalog.btrim(coalesce(new.regnr,'')),' ',''));
begin
  if new.status is distinct from 'COMPLETED' or new.completed_at is null or new.id is null or v_norm_reg = '' then
    return new;
  end if;

  -- Once a final Check-in is locked, a different later completed Check-in is evidence of
  -- an exception only. It must never replace the first source record.
  select count(*) into v_locked_count
  from public.garage_sista_incheckningar f
  join public.garage_items g on g.garage_item_id = f.garage_item_id
  where pg_catalog.upper(pg_catalog.replace(pg_catalog.btrim(f.regnr),' ','')) = v_norm_reg
    and f.checkin_id <> new.id
    and new.completed_at >= f.final_checkin_completed_at
    and g.source_kind = 'SALU_PLANERING'
    and g.voided_at is null
    and g.handed_off_nybil_id is null
    and g.completed_at is null;

  if v_locked_count = 1 then
    select f.* into v_locked
    from public.garage_sista_incheckningar f
    join public.garage_items g on g.garage_item_id = f.garage_item_id
    where pg_catalog.upper(pg_catalog.replace(pg_catalog.btrim(f.regnr),' ','')) = v_norm_reg
      and f.checkin_id <> new.id
      and new.completed_at >= f.final_checkin_completed_at
      and g.source_kind = 'SALU_PLANERING'
      and g.voided_at is null
      and g.handed_off_nybil_id is null
      and g.completed_at is null
    limit 1;

    insert into public.garage_sista_incheckning_conflicts(
      garage_item_id,decision_id,locked_sista_incheckning_id,conflicting_checkin_id,
      regnr,checkin_completed_at,conflict_reason,source_provenance
    ) values (
      v_locked.garage_item_id,v_locked.decision_id,v_locked.sista_incheckning_id,new.id,
      new.regnr,new.completed_at,'LATER_COMPLETED_CHECKIN_AFTER_LOCK',
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'sourceOwner','CHECKIN','sourceEntity','checkins','sourceRecordId',new.id,
        'completedBy',new.completed_by,'checkerName',new.checker_name,'checkerEmail',new.checker_email
      ))
    ) on conflict (decision_id,conflicting_checkin_id,conflict_reason) do nothing;
    return new;
  elsif v_locked_count > 1 then
    -- Ambiguous historical state is never resolved by a latest-wins or regnr heuristic.
    return new;
  end if;

  if new.completed_by is null then
    return new;
  end if;

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

  -- Serialize against SISTA HYRAN version creation using the exact same advisory key as Step 2.
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
        'completedBy',new.completed_by,'checkerName',new.checker_name,'checkerEmail',new.checker_email
      ))
    ) on conflict (decision_id,conflicting_checkin_id,conflict_reason) do nothing;
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
        pg_catalog.jsonb_build_object('sourceOwner','CHECKIN','sourceEntity','checkins','sourceRecordId',new.id)
      ) on conflict (decision_id,conflicting_checkin_id,conflict_reason) do nothing;
    end if;
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
    where intent_id = v_intent.intent_id
      and consumed_at is null;
  end if;

  return new;
end;
$$;

create trigger checkin_sista_incheckning_verify_v1
after insert or update on public.checkins
for each row
when (new.status = 'COMPLETED' and new.completed_at is not null)
execute function public.verify_garage_sista_incheckning_from_checkin_v1();

-- SISTA INCHECKNING is the next locked phase. Same idempotency replay is still harmless
-- because Step 2 returns it without INSERT; any new decision version attempts an INSERT
-- and is rejected here after final verification.
create or replace function public.reject_new_sista_hyran_after_final_checkin_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1 from public.garage_sista_incheckningar f
    where f.garage_item_id = new.garage_item_id
  ) then
    raise exception 'Ny SISTA HYRAN-version är låst efter verifierad SISTA INCHECKNING' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger garage_sista_hyran_locked_after_final_checkin_v1
before insert on public.garage_sista_hyran_decisions
for each row execute function public.reject_new_sista_hyran_after_final_checkin_v1();

alter table public.garage_sista_incheckning_intents enable row level security;
alter table public.garage_sista_incheckningar enable row level security;
alter table public.garage_sista_incheckning_conflicts enable row level security;

revoke all on public.garage_sista_incheckning_intents from public, anon, authenticated, service_role;
revoke all on public.garage_sista_incheckningar from public, anon, authenticated, service_role;
revoke all on public.garage_sista_incheckning_conflicts from public, anon, authenticated, service_role;
revoke all on public.garage_sista_incheckning_current from public, anon, authenticated, service_role;

grant select on public.garage_sista_incheckning_intents to service_role;
grant select on public.garage_sista_incheckningar to service_role;
grant select on public.garage_sista_incheckning_conflicts to service_role;
grant select on public.garage_sista_incheckning_current to service_role;

revoke all on function public.arm_garage_sista_incheckning_intent_v1(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.verify_garage_sista_incheckning_from_checkin_v1() from public, anon, authenticated;
revoke all on function public.reject_garage_sista_incheckning_history_mutation_v1() from public, anon, authenticated;
revoke all on function public.reject_new_sista_hyran_after_final_checkin_v1() from public, anon, authenticated;

grant execute on function public.arm_garage_sista_incheckning_intent_v1(uuid,uuid,uuid) to service_role;

comment on function public.arm_garage_sista_incheckning_intent_v1(uuid,uuid,uuid) is
  'Arms exact authenticated Step 3 provenance for the current Garage + SISTA HYRAN decision. Does not write Check-in or business state.';
comment on function public.verify_garage_sista_incheckning_from_checkin_v1() is
  'Consumes an exact authenticated intent only when the normal source-owned Check-in is COMPLETED and completed_at >= decided_at. Retry is idempotent; later completed Check-ins become conflicts and never overwrite the lock.';
comment on function public.reject_new_sista_hyran_after_final_checkin_v1() is
  'Permanent Step 3 phase lock: no new SISTA HYRAN decision version after verified SISTA INCHECKNING.';

commit;
