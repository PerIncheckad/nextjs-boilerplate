begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Auth UUID and employees.id are separate identities. Resolve the verified auth email
-- to exactly one active employee before any SISTA HYRAN mandate check.
create or replace function public.resolve_active_employee_identity_v1(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_employee_id uuid;
  v_count integer;
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
begin
  if v_email = '' then
    raise exception 'Verifierad auth-email krävs' using errcode = '42501';
  end if;

  select count(*), min(e.id)
    into v_count, v_employee_id
  from public.employees e
  where pg_catalog.lower(pg_catalog.btrim(coalesce(e.email, ''))) = v_email
    and coalesce(e.is_active, false)
    and coalesce(e.active, true);

  if v_count <> 1 or v_employee_id is null then
    raise exception 'Exakt en aktiv employee-identitet krävs' using errcode = '42501';
  end if;

  return v_employee_id;
end;
$$;

-- Remove the intermediate signature that accepted a caller-selected employees.id.
revoke all on function public.decide_garage_sista_hyran_v1(uuid,uuid,uuid,timestamptz,text,text) from public, anon, authenticated, service_role;
drop function public.decide_garage_sista_hyran_v1(uuid,uuid,uuid,timestamptz,text,text);

create or replace function public.decide_garage_sista_hyran_v1(
  p_garage_item_id uuid,
  p_actor_email text,
  p_auth_user_id uuid,
  p_last_rental_at timestamptz,
  p_decision_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.garage_items%rowtype;
  v_plan public.salu_plans%rowtype;
  v_existing public.garage_sista_hyran_decisions%rowtype;
  v_previous public.garage_sista_hyran_decisions%rowtype;
  v_decision public.garage_sista_hyran_decisions%rowtype;
  v_employee_id uuid;
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_garage_item_id is null then
    raise exception 'Garage item krävs' using errcode = '22023';
  end if;
  if p_auth_user_id is null then
    raise exception 'Verifierad auth-identitet krävs' using errcode = '42501';
  end if;
  if v_key = '' then
    raise exception 'Idempotency key krävs' using errcode = '22023';
  end if;

  v_employee_id := public.resolve_active_employee_identity_v1(p_actor_email);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('garage-sista-hyran:' || p_garage_item_id::text));

  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage item finns inte' using errcode = 'P0002';
  end if;
  if v_item.voided_at is not null then
    raise exception 'Makulerat Garage-objekt kan inte beslutas' using errcode = 'P0001';
  end if;
  if v_item.handed_off_nybil_id is not null or v_item.completed_at is not null then
    raise exception 'Garage-objektet är redan i en senare låst fas' using errcode = 'P0001';
  end if;
  if v_item.source_kind <> 'SALU_PLANERING' or v_item.source_salu_flag_id is null then
    raise exception 'SISTA HYRAN kräver exakt SALU_PLANERING-källa' using errcode = 'P0001';
  end if;
  if v_item.garage_direction is not null then
    raise exception 'SALU_PLANERING får inte ha fysisk IN/UT-riktning' using errcode = '23514';
  end if;

  select * into v_plan
  from public.salu_plans
  where flag_id = v_item.source_salu_flag_id;

  if not found then
    raise exception 'Exakt ursprunglig SALU-plan saknas' using errcode = 'P0002';
  end if;

  perform public.assert_actor_process_mandate(
    v_employee_id,
    'GARAGE_SISTA_HYRAN_DECIDE',
    'BILKONTROLLCHEF',
    'PROCESS',
    'SALU'
  );

  select * into v_existing
  from public.garage_sista_hyran_decisions
  where garage_item_id = p_garage_item_id
    and idempotency_key = v_key;

  if found then
    return pg_catalog.jsonb_build_object(
      'decision', pg_catalog.to_jsonb(v_existing),
      'sistaHyran', true,
      'idempotentReplay', true,
      'terminalClosure', false,
      'avvecklaStarted', false,
      'canonicalFleetExit', false,
      'checkinWritten', false,
      'physicalGaragePositionChanged', false
    );
  end if;

  select * into v_previous
  from public.garage_sista_hyran_decisions
  where garage_item_id = p_garage_item_id
  order by decision_version desc
  limit 1;

  insert into public.garage_sista_hyran_decisions (
    garage_item_id,
    salu_plan_id,
    source_salu_flag_id,
    regnr,
    decision_status,
    decision_version,
    last_rental_at,
    decision_note,
    decided_at,
    decided_by_employee_id,
    decided_by_auth_user_id,
    idempotency_key,
    supersedes_decision_id
  ) values (
    v_item.garage_item_id,
    v_plan.plan_id,
    v_item.source_salu_flag_id,
    v_plan.regnr,
    'SISTA HYRAN',
    coalesce(v_previous.decision_version, 0) + 1,
    p_last_rental_at,
    nullif(pg_catalog.btrim(coalesce(p_decision_note, '')), ''),
    v_now,
    v_employee_id,
    p_auth_user_id,
    v_key,
    v_previous.decision_id
  ) returning * into v_decision;

  return pg_catalog.jsonb_build_object(
    'decision', pg_catalog.to_jsonb(v_decision),
    'sistaHyran', true,
    'idempotentReplay', false,
    'terminalClosure', false,
    'avvecklaStarted', false,
    'canonicalFleetExit', false,
    'checkinWritten', false,
    'physicalGaragePositionChanged', false
  );
end;
$$;

revoke all on function public.resolve_active_employee_identity_v1(text) from public, anon, authenticated;
revoke all on function public.decide_garage_sista_hyran_v1(uuid,text,uuid,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.resolve_active_employee_identity_v1(text) to service_role;
grant execute on function public.decide_garage_sista_hyran_v1(uuid,text,uuid,timestamptz,text,text) to service_role;

comment on function public.resolve_active_employee_identity_v1(text) is
  'Resolves verified auth email to exactly one active employees.id. Missing or ambiguous identity denies authorization.';
comment on function public.decide_garage_sista_hyran_v1(uuid,text,uuid,timestamptz,text,text) is
  'SALU V2 Step 2 explicit SISTA HYRAN decision. Auth UUID is provenance only; employee identity is resolved from verified auth email before BILKONTROLLCHEF + GARAGE_SISTA_HYRAN_DECIDE + PROCESS/SALU mandate check.';

commit;
