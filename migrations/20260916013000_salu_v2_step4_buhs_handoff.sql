begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- SALU V2 / Step 4 / part 1
-- Exact Step 3 final -> frozen BUHS PASS snapshot -> exact SALU V2 -> AVVECKLA handoff.
-- SALU_PLANERING remains directionless. No archive table, no historical backfill.

insert into public.mandate_capability_definitions (capability_code,title,description)
values ('SALU_BUHS_VERIFY','Verifiera BUHS för terminal SALU','Får skapa explicit BUHS PASS-snapshot för exakt SALU V2 SISTA INCHECKNING.')
on conflict (capability_code) do update
set title=excluded.title,description=excluded.description,active=true,changed_at=now();

create table public.salu_v2_buhs_verifications (
  buhs_verification_id uuid primary key default gen_random_uuid(),
  sista_incheckning_id uuid not null references public.garage_sista_incheckningar(sista_incheckning_id) on delete restrict,
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  salu_plan_id uuid not null references public.salu_plans(plan_id) on delete restrict,
  source_salu_flag_id uuid not null references public.salu_flags(flag_id) on delete restrict,
  decision_id uuid not null references public.garage_sista_hyran_decisions(decision_id) on delete restrict,
  decision_version integer not null,
  checkin_id uuid not null references public.checkins(id) on delete restrict,
  final_checkin_completed_at timestamptz not null,
  revision_no integer not null check (revision_no > 0),
  idempotency_key text not null,
  source_row_count integer not null check (source_row_count >= 0),
  source_set_hash text not null,
  total_result text not null check (total_result = 'PASS'),
  verified_at timestamptz not null default clock_timestamp(),
  verified_by_employee_id uuid not null references public.employees(id) on delete restrict,
  verified_by_auth_user_id uuid not null,
  verified_business_function text not null check (verified_business_function in ('VD','BILKONTROLLCHEF')),
  verified_by_email text,
  unique (sista_incheckning_id,revision_no),
  unique (sista_incheckning_id,idempotency_key)
);

create table public.salu_v2_buhs_verification_rows (
  buhs_verification_row_id uuid primary key default gen_random_uuid(),
  buhs_verification_id uuid not null references public.salu_v2_buhs_verifications(buhs_verification_id) on delete restrict,
  damage_id uuid not null references public.damages(id) on delete restrict,
  disposition text not null check (disposition = 'PASS'),
  created_at timestamptz not null default clock_timestamp(),
  unique (buhs_verification_id,damage_id)
);

create table public.garage_salu_v2_avveckla_handoffs (
  salu_v2_handoff_id uuid primary key default gen_random_uuid(),
  sista_incheckning_id uuid not null unique references public.garage_sista_incheckningar(sista_incheckning_id) on delete restrict,
  buhs_verification_id uuid not null unique references public.salu_v2_buhs_verifications(buhs_verification_id) on delete restrict,
  garage_item_id uuid not null unique references public.garage_items(garage_item_id) on delete restrict,
  salu_plan_id uuid not null references public.salu_plans(plan_id) on delete restrict,
  source_salu_flag_id uuid not null references public.salu_flags(flag_id) on delete restrict,
  decision_id uuid not null references public.garage_sista_hyran_decisions(decision_id) on delete restrict,
  decision_version integer not null,
  checkin_id uuid not null references public.checkins(id) on delete restrict,
  final_checkin_completed_at timestamptz not null,
  avveckla_case_id uuid not null unique references public.garage_avveckla_cases(avveckla_case_id) on delete restrict,
  journey_period_id uuid not null references public.vehicle_journey_periods(period_id) on delete restrict,
  handed_off_at timestamptz not null default clock_timestamp(),
  handed_off_by uuid not null,
  handed_off_by_email text
);

alter table public.garage_avveckla_events
  add column if not exists salu_v2_handoff_id uuid references public.garage_salu_v2_avveckla_handoffs(salu_v2_handoff_id) on delete restrict;

create index salu_v2_buhs_verifications_final_idx on public.salu_v2_buhs_verifications(sista_incheckning_id,revision_no desc);
create index salu_v2_buhs_rows_snapshot_idx on public.salu_v2_buhs_verification_rows(buhs_verification_id,damage_id);

alter table public.salu_v2_buhs_verifications enable row level security;
alter table public.salu_v2_buhs_verification_rows enable row level security;
alter table public.garage_salu_v2_avveckla_handoffs enable row level security;

revoke all on public.salu_v2_buhs_verifications from public,anon,authenticated,service_role;
revoke all on public.salu_v2_buhs_verification_rows from public,anon,authenticated,service_role;
revoke all on public.garage_salu_v2_avveckla_handoffs from public,anon,authenticated,service_role;
grant select on public.salu_v2_buhs_verifications to service_role;
grant select on public.salu_v2_buhs_verification_rows to service_role;
grant select on public.garage_salu_v2_avveckla_handoffs to service_role;

create or replace function public.reject_salu_v2_step4_history_mutation_v1()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  raise exception 'SALU V2 Step 4 history is append-only' using errcode='P0001';
end;$$;

create trigger salu_v2_buhs_verifications_append_only before update or delete on public.salu_v2_buhs_verifications for each row execute function public.reject_salu_v2_step4_history_mutation_v1();
create trigger salu_v2_buhs_rows_append_only before update or delete on public.salu_v2_buhs_verification_rows for each row execute function public.reject_salu_v2_step4_history_mutation_v1();
create trigger salu_v2_avveckla_handoffs_append_only before update or delete on public.garage_salu_v2_avveckla_handoffs for each row execute function public.reject_salu_v2_step4_history_mutation_v1();

create or replace function public.actor_can_verify_salu_buhs_v1(p_employee_id uuid,p_at timestamptz default now())
returns text language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if p_employee_id is null then return null; end if;
  if public.actor_has_process_mandate(p_employee_id,'SALU_BUHS_VERIFY','BILKONTROLLCHEF','PROCESS','SALU',p_at) then return 'BILKONTROLLCHEF'; end if;
  if public.actor_has_process_mandate(p_employee_id,'SALU_BUHS_VERIFY','VD','PROCESS','SALU',p_at) then return 'VD'; end if;
  return null;
end;$$;

create or replace function public.current_salu_buhs_source_ids_v1(p_sista_incheckning_id uuid)
returns uuid[] language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_final public.garage_sista_incheckningar%rowtype; v_ids uuid[];
begin
  select * into v_final from public.garage_sista_incheckningar where sista_incheckning_id=p_sista_incheckning_id;
  if not found then raise exception 'STEP3_FINAL_REQUIRED' using errcode='P0002'; end if;
  select coalesce(array_agg(d.id order by d.id::text),'{}'::uuid[]) into v_ids
  from public.damages d
  where d.source='BUHS'
    and upper(regexp_replace(d.regnr,'\s+','','g'))=upper(regexp_replace(v_final.regnr,'\s+','','g'));
  return v_ids;
end;$$;

create or replace function public.salu_buhs_source_set_hash_v1(p_ids uuid[])
returns text language sql immutable security definer set search_path=pg_catalog as $$
  select md5(coalesce((select string_agg(x::text,',' order by x::text) from unnest(coalesce(p_ids,'{}'::uuid[])) x),''));
$$;

create or replace function public.verify_salu_v2_buhs_v1(
  p_sista_incheckning_id uuid,
  p_expected_damage_ids uuid[],
  p_idempotency_key text,
  p_actor_email text,
  p_auth_user_id uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_final public.garage_sista_incheckningar%rowtype;
  v_item public.garage_items%rowtype;
  v_employee_id uuid;
  v_function text;
  v_current_ids uuid[];
  v_expected_ids uuid[];
  v_hash text;
  v_existing public.salu_v2_buhs_verifications%rowtype;
  v_snapshot public.salu_v2_buhs_verifications%rowtype;
  v_revision integer;
  v_damage_id uuid;
begin
  if p_auth_user_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'AUTH_AND_IDEMPOTENCY_REQUIRED' using errcode='22023'; end if;
  select * into v_final from public.garage_sista_incheckningar where sista_incheckning_id=p_sista_incheckning_id for share;
  if not found then raise exception 'STEP3_FINAL_REQUIRED' using errcode='P0002'; end if;

  select * into v_item from public.garage_items where garage_item_id=v_final.garage_item_id for share;
  if not found or v_item.source_kind<>'SALU_PLANERING' or v_item.garage_direction is not null or v_item.voided_at is not null or v_item.completed_at is not null then
    raise exception 'SALU_STEP3_CHAIN_NOT_ACTIVE' using errcode='P0001';
  end if;

  v_employee_id:=public.resolve_active_employee_identity_v1(p_actor_email);
  v_function:=public.actor_can_verify_salu_buhs_v1(v_employee_id,clock_timestamp());
  if v_function is null then raise exception 'BUHS_VERIFY_FORBIDDEN' using errcode='42501'; end if;

  select coalesce(array_agg(distinct x order by x::text),'{}'::uuid[]) into v_expected_ids from unnest(coalesce(p_expected_damage_ids,'{}'::uuid[])) x;
  v_current_ids:=public.current_salu_buhs_source_ids_v1(v_final.sista_incheckning_id);
  if cardinality(v_expected_ids)<>cardinality(coalesce(p_expected_damage_ids,'{}'::uuid[])) or v_expected_ids is distinct from v_current_ids then
    raise exception 'BUHS_SOURCE_SET_MISMATCH' using errcode='P0001';
  end if;
  v_hash:=public.salu_buhs_source_set_hash_v1(v_current_ids);

  perform pg_advisory_xact_lock(hashtextextended('SALU_V2_BUHS:'||v_final.sista_incheckning_id::text,0));
  select * into v_existing from public.salu_v2_buhs_verifications
   where sista_incheckning_id=v_final.sista_incheckning_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_existing.source_set_hash=v_hash and v_existing.verified_by_employee_id=v_employee_id and v_existing.verified_by_auth_user_id=p_auth_user_id then
      return to_jsonb(v_existing)||jsonb_build_object('idempotentReplay',true);
    end if;
    raise exception 'BUHS_IDEMPOTENCY_CONFLICT' using errcode='P0001';
  end if;

  select coalesce(max(revision_no),0)+1 into v_revision from public.salu_v2_buhs_verifications where sista_incheckning_id=v_final.sista_incheckning_id;
  insert into public.salu_v2_buhs_verifications(
    sista_incheckning_id,garage_item_id,salu_plan_id,source_salu_flag_id,decision_id,decision_version,
    checkin_id,final_checkin_completed_at,revision_no,idempotency_key,source_row_count,source_set_hash,total_result,
    verified_by_employee_id,verified_by_auth_user_id,verified_business_function,verified_by_email
  ) values (
    v_final.sista_incheckning_id,v_final.garage_item_id,v_final.salu_plan_id,v_final.source_salu_flag_id,v_final.decision_id,v_final.decision_version,
    v_final.checkin_id,v_final.final_checkin_completed_at,v_revision,btrim(p_idempotency_key),cardinality(v_current_ids),v_hash,'PASS',
    v_employee_id,p_auth_user_id,v_function,nullif(lower(btrim(coalesce(p_actor_email,''))),'')
  ) returning * into v_snapshot;

  foreach v_damage_id in array v_current_ids loop
    insert into public.salu_v2_buhs_verification_rows(buhs_verification_id,damage_id,disposition)
    values(v_snapshot.buhs_verification_id,v_damage_id,'PASS');
  end loop;
  return to_jsonb(v_snapshot)||jsonb_build_object('idempotentReplay',false);
end;$$;

create or replace function public.assert_salu_v2_buhs_snapshot_current_v1(p_buhs_verification_id uuid)
returns public.salu_v2_buhs_verifications language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_snapshot public.salu_v2_buhs_verifications%rowtype; v_current uuid[]; v_saved uuid[];
begin
  select * into v_snapshot from public.salu_v2_buhs_verifications where buhs_verification_id=p_buhs_verification_id;
  if not found or v_snapshot.total_result<>'PASS' then raise exception 'BUHS_PASS_REQUIRED' using errcode='P0001'; end if;
  v_current:=public.current_salu_buhs_source_ids_v1(v_snapshot.sista_incheckning_id);
  select coalesce(array_agg(r.damage_id order by r.damage_id::text),'{}'::uuid[]) into v_saved
    from public.salu_v2_buhs_verification_rows r where r.buhs_verification_id=v_snapshot.buhs_verification_id and r.disposition='PASS';
  if cardinality(v_saved)<>v_snapshot.source_row_count or v_saved is distinct from v_current or public.salu_buhs_source_set_hash_v1(v_current)<>v_snapshot.source_set_hash then
    raise exception 'BUHS_SNAPSHOT_STALE' using errcode='P0001';
  end if;
  return v_snapshot;
end;$$;

create or replace function public.start_salu_v2_avveckla_v1(
  p_sista_incheckning_id uuid,
  p_buhs_verification_id uuid,
  p_actor uuid,
  p_actor_email text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_final public.garage_sista_incheckningar%rowtype;
  v_snapshot public.salu_v2_buhs_verifications%rowtype;
  v_item public.garage_items%rowtype;
  v_case public.garage_avveckla_cases%rowtype;
  v_handoff public.garage_salu_v2_avveckla_handoffs%rowtype;
  v_period public.vehicle_journey_periods%rowtype;
  v_period_count integer;
  v_event_id uuid;
  v_regnr text;
begin
  if p_actor is null then raise exception 'ACTOR_REQUIRED' using errcode='22023'; end if;
  select * into v_final from public.garage_sista_incheckningar where sista_incheckning_id=p_sista_incheckning_id for share;
  if not found then raise exception 'STEP3_FINAL_REQUIRED' using errcode='P0002'; end if;
  v_snapshot:=public.assert_salu_v2_buhs_snapshot_current_v1(p_buhs_verification_id);
  if v_snapshot.sista_incheckning_id<>v_final.sista_incheckning_id
     or v_snapshot.garage_item_id<>v_final.garage_item_id or v_snapshot.salu_plan_id<>v_final.salu_plan_id
     or v_snapshot.source_salu_flag_id<>v_final.source_salu_flag_id or v_snapshot.decision_id<>v_final.decision_id
     or v_snapshot.decision_version<>v_final.decision_version or v_snapshot.checkin_id<>v_final.checkin_id
     or v_snapshot.final_checkin_completed_at<>v_final.final_checkin_completed_at then
    raise exception 'STEP3_BUHS_IDENTITY_MISMATCH' using errcode='P0001';
  end if;

  select * into v_item from public.garage_items where garage_item_id=v_final.garage_item_id for update;
  if not found or v_item.source_kind<>'SALU_PLANERING' or v_item.source_salu_flag_id<>v_final.source_salu_flag_id
     or v_item.garage_direction is not null or v_item.voided_at is not null or v_item.handed_off_nybil_id is not null or v_item.completed_at is not null then
    raise exception 'SALU_PLANERING_DIRECTIONLESS_REQUIRED' using errcode='P0001';
  end if;

  select * into v_handoff from public.garage_salu_v2_avveckla_handoffs where sista_incheckning_id=v_final.sista_incheckning_id;
  if found then
    if v_handoff.buhs_verification_id=p_buhs_verification_id then return to_jsonb(v_handoff)||jsonb_build_object('idempotentReplay',true); end if;
    raise exception 'SALU_AVVECKLA_HANDOFF_CONFLICT' using errcode='P0001';
  end if;

  v_regnr:=upper(regexp_replace(v_final.regnr,'\s+','','g'));
  select count(*) into v_period_count from public.vehicle_journey_periods p where upper(regexp_replace(p.regnr,'\s+','','g'))=v_regnr and p.ended_at is null;
  if v_period_count<>1 then raise exception 'SALU_AVVECKLA_REQUIRES_EXACTLY_ONE_OPEN_LAYER1_PERIOD' using errcode='P0001'; end if;
  select * into v_period from public.vehicle_journey_periods p where upper(regexp_replace(p.regnr,'\s+','','g'))=v_regnr and p.ended_at is null for update;

  if exists(select 1 from public.garage_avveckla_cases c where c.garage_item_id=v_item.garage_item_id) then
    raise exception 'AVVECKLA_CASE_ALREADY_EXISTS_WITHOUT_SALU_HANDOFF' using errcode='P0001';
  end if;

  insert into public.garage_avveckla_cases(garage_item_id,regnr,reason,started_by,started_by_email)
  values(v_item.garage_item_id,v_regnr,'SALU_V2_STEP4',p_actor,nullif(lower(btrim(coalesce(p_actor_email,''))),'') ) returning * into v_case;

  insert into public.garage_salu_v2_avveckla_handoffs(
    sista_incheckning_id,buhs_verification_id,garage_item_id,salu_plan_id,source_salu_flag_id,
    decision_id,decision_version,checkin_id,final_checkin_completed_at,avveckla_case_id,journey_period_id,handed_off_by,handed_off_by_email
  ) values(
    v_final.sista_incheckning_id,v_snapshot.buhs_verification_id,v_final.garage_item_id,v_final.salu_plan_id,v_final.source_salu_flag_id,
    v_final.decision_id,v_final.decision_version,v_final.checkin_id,v_final.final_checkin_completed_at,v_case.avveckla_case_id,v_period.period_id,p_actor,
    nullif(lower(btrim(coalesce(p_actor_email,''))),'')
  ) returning * into v_handoff;

  insert into public.garage_avveckla_events(avveckla_case_id,garage_item_id,regnr,event_type,event_key,actor_id,actor_email,actor_source,payload,salu_v2_handoff_id)
  values(v_case.avveckla_case_id,v_item.garage_item_id,v_regnr,'AVVECKLA_STARTED','garage-avveckla:'||v_case.avveckla_case_id::text||':STARTED',p_actor,
    nullif(lower(btrim(coalesce(p_actor_email,''))),''),'MANUELL',jsonb_build_object('reason','SALU_V2_STEP4','saluV2HandoffId',v_handoff.salu_v2_handoff_id),v_handoff.salu_v2_handoff_id)
  returning event_id into v_event_id;

  return to_jsonb(v_handoff)||jsonb_build_object('started_event_id',v_event_id,'idempotentReplay',false);
end;$$;

revoke all on function public.actor_can_verify_salu_buhs_v1(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.current_salu_buhs_source_ids_v1(uuid) from public,anon,authenticated;
revoke all on function public.salu_buhs_source_set_hash_v1(uuid[]) from public,anon,authenticated;
revoke all on function public.verify_salu_v2_buhs_v1(uuid,uuid[],text,text,uuid) from public,anon,authenticated;
revoke all on function public.assert_salu_v2_buhs_snapshot_current_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function public.start_salu_v2_avveckla_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.actor_can_verify_salu_buhs_v1(uuid,timestamptz) to service_role;
grant execute on function public.current_salu_buhs_source_ids_v1(uuid) to service_role;
grant execute on function public.verify_salu_v2_buhs_v1(uuid,uuid[],text,text,uuid) to service_role;
grant execute on function public.start_salu_v2_avveckla_v1(uuid,uuid,uuid,text) to service_role;

comment on table public.salu_v2_buhs_verifications is 'Append-only BUHS V1 PASS snapshot bound to one exact Step 3 final. Validity is rechecked against the current exact damages.id source set before handoff and terminal.';
comment on table public.garage_salu_v2_avveckla_handoffs is 'Exact relational SALU V2 Step 3 + BUHS PASS -> existing AVVECKLA case handoff. SALU_PLANERING remains directionless.';

commit;
