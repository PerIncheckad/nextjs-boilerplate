begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.vehicle_journey_state_reconciliations (
  reconciliation_id uuid primary key default gen_random_uuid(),
  regnr text not null check (length(trim(regnr)) > 0),
  target_state text not null check (target_state in ('AVAILABLE', 'PREPARATION')),
  basis_source_system text not null,
  basis_source_entity text not null,
  basis_source_record_id text not null,
  basis_source_recorded_at timestamptz not null,
  basis_source_value jsonb not null check (jsonb_typeof(basis_source_value) = 'object'),
  established_at timestamptz not null,
  established_by uuid,
  established_by_email text,
  created_at timestamptz not null default now(),
  unique (regnr),
  unique (basis_source_system, basis_source_entity, basis_source_record_id)
);

alter table public.vehicle_journey_state_reconciliations enable row level security;
revoke all on public.vehicle_journey_state_reconciliations from public, anon, authenticated, service_role;

create or replace function public.reconcile_missing_vehicle_journey_state_from_nybil(
  p_regnr text,
  p_established_at timestamptz,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  v_established_at timestamptz := coalesce(p_established_at, clock_timestamp());
  v_nybil public.nybil_inventering%rowtype;
  v_target_state text;
  v_reconciliation_id uuid;
  v_result jsonb;
begin
  if v_regnr = '' then
    raise exception 'Registreringsnummer krävs' using errcode = '22023';
  end if;

  if v_established_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'Reconciliation time cannot be in the future' using errcode = '22007';
  end if;

  perform pg_advisory_xact_lock(hashtext('vehicle-journey-reconcile:' || v_regnr));

  if exists (
    select 1
    from public.vehicle_journey_periods
    where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_regnr
  ) then
    raise exception 'Reconciliation is only permitted when the vehicle has no journey periods'
      using errcode = 'P0001';
  end if;

  select *
  into v_nybil
  from public.nybil_inventering
  where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_regnr
    and coalesce(is_duplicate, false) = false
    and klar_for_uthyrning is not null
  order by created_at desc, id desc
  limit 1;

  if not found then
    raise exception 'Verified Nybil rental-readiness baseline is missing'
      using errcode = 'P0002';
  end if;

  if v_established_at < v_nybil.created_at then
    raise exception 'Reconciliation time cannot predate the verified source fact'
      using errcode = '22007';
  end if;

  if exists (
    select 1
    from public.vehicle_edits e
    where upper(regexp_replace(e.regnr, '\s+', '', 'g')) = v_regnr
      and e.field_name = 'klar_for_uthyrning'
      and lower(trim(coalesce(e.new_value, ''))) in ('ja', 'nej')
      and e.edited_at > v_nybil.created_at
  ) then
    raise exception 'A later Status rental-readiness fact exists; Nybil baseline is not current'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.checkins c
    where upper(regexp_replace(c.regnr, '\s+', '', 'g')) = v_regnr
      and c.status = 'COMPLETED'
      and c.completed_at > v_nybil.created_at
      and lower(coalesce(c.checklist ->> 'rental_unavailable', 'false')) = 'true'
  ) then
    raise exception 'A later Check-in rental-unavailable fact exists; Nybil baseline is not current'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.rental_operational_facts r
    where upper(regexp_replace(r.regnr, '\s+', '', 'g')) = v_regnr
      and r.out_at > v_nybil.created_at
  ) then
    raise exception 'A later verified rental fact exists; Nybil baseline is not current'
      using errcode = 'P0001';
  end if;

  v_target_state := case when v_nybil.klar_for_uthyrning then 'AVAILABLE' else 'PREPARATION' end;
  v_reconciliation_id := gen_random_uuid();

  insert into public.vehicle_journey_state_reconciliations (
    reconciliation_id,
    regnr,
    target_state,
    basis_source_system,
    basis_source_entity,
    basis_source_record_id,
    basis_source_recorded_at,
    basis_source_value,
    established_at,
    established_by,
    established_by_email
  ) values (
    v_reconciliation_id,
    v_regnr,
    v_target_state,
    'NYBIL',
    'nybil_inventering',
    v_nybil.id::text,
    v_nybil.created_at,
    jsonb_build_object('klar_for_uthyrning', v_nybil.klar_for_uthyrning),
    v_established_at,
    p_actor_id,
    nullif(trim(coalesce(p_actor_email, '')), '')
  );

  v_result := public.transition_vehicle_journey_state(
    gen_random_uuid(),
    v_regnr,
    v_target_state,
    v_established_at,
    null,
    null,
    'INCHECKAD',
    'vehicle_journey_state_reconciliations',
    v_reconciliation_id::text,
    p_actor_id,
    'SYSTEM',
    nullif(trim(coalesce(p_actor_email, '')), ''),
    jsonb_build_object(
      'sourceKind', 'CURRENT_STATE_RECONCILIATION',
      'reconciliationReason', 'PRE_WRITE_THROUGH_GAP',
      'basisSourceSystem', 'NYBIL',
      'basisSourceEntity', 'nybil_inventering',
      'basisSourceRecordId', v_nybil.id,
      'basisSourceRecordedAt', v_nybil.created_at,
      'basisReadyForRental', v_nybil.klar_for_uthyrning,
      'historicalBackfill', false,
      'historicalCoverageStartsAt', v_established_at
    )
  );

  return jsonb_build_object(
    'reconciliation_id', v_reconciliation_id,
    'regnr', v_regnr,
    'target_state', v_target_state,
    'basis_source_record_id', v_nybil.id,
    'basis_source_recorded_at', v_nybil.created_at,
    'established_at', v_established_at,
    'period', v_result -> 'period'
  );
end;
$$;

revoke all on function public.reconcile_missing_vehicle_journey_state_from_nybil(text,timestamptz,uuid,text)
  from public, anon, authenticated;
grant execute on function public.reconcile_missing_vehicle_journey_state_from_nybil(text,timestamptz,uuid,text)
  to service_role;

comment on function public.reconcile_missing_vehicle_journey_state_from_nybil(text,timestamptz,uuid,text) is
  'Establishes current Layer 1 state at reconciliation time from a verified Nybil baseline only when no journey periods or later conflicting state facts exist. It never backdates the period to the historical Nybil timestamp.';

commit;
