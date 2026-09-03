begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- LEGACY v1 is a current-state bootstrap only. It must never reconstruct or
-- rewrite earlier Nybil, Garage, SALU or Layer 1 history.
create table public.vehicle_legacy_current_state_entries (
  entry_id uuid primary key default gen_random_uuid(),
  regnr text not null check (length(trim(regnr)) > 0),
  normalized_regnr text not null,
  object_type text not null check (object_type = 'LEGACY_FLEET'),
  current_state text not null check (current_state in ('AVAILABLE', 'PREPARATION', 'DOWNTIME')),
  reason_code text,
  reason_text text,
  verification_method text not null check (verification_method = 'MANUAL_CURRENT_STATE_VERIFICATION'),
  evidence_reference text not null check (length(trim(evidence_reference)) > 0),
  identity_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(identity_snapshot) = 'object'),
  verified_at timestamptz not null,
  verified_by uuid not null,
  verified_by_email text not null check (length(trim(verified_by_email)) > 0),
  historical_backfill boolean not null default false check (historical_backfill = false),
  created_at timestamptz not null default now(),
  unique (normalized_regnr),
  check (regnr = normalized_regnr),
  check (normalized_regnr = upper(regexp_replace(regnr, '\s+', '', 'g'))),
  check (
    (current_state <> 'DOWNTIME' and reason_code is null and reason_text is null)
    or
    (current_state = 'DOWNTIME' and reason_code in (
      'DAMAGE', 'WORKSHOP', 'SERVICE', 'WAITING_PARTS',
      'MISSING_EQUIPMENT', 'TRANSPORT', 'ADMINISTRATION', 'OTHER'
    ))
  ),
  check (current_state <> 'DOWNTIME' or reason_code <> 'OTHER' or length(trim(coalesce(reason_text, ''))) > 0)
);

alter table public.vehicle_legacy_current_state_entries enable row level security;
revoke all on public.vehicle_legacy_current_state_entries from public, anon, authenticated, service_role;

create or replace function public.reject_vehicle_legacy_current_state_entry_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'LEGACY current-state provenance is immutable' using errcode = 'P0001';
end;
$$;

revoke all on function public.reject_vehicle_legacy_current_state_entry_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists vehicle_legacy_current_state_entries_no_update on public.vehicle_legacy_current_state_entries;
create trigger vehicle_legacy_current_state_entries_no_update
before update on public.vehicle_legacy_current_state_entries
for each row execute function public.reject_vehicle_legacy_current_state_entry_mutation();

drop trigger if exists vehicle_legacy_current_state_entries_no_delete on public.vehicle_legacy_current_state_entries;
create trigger vehicle_legacy_current_state_entries_no_delete
before delete on public.vehicle_legacy_current_state_entries
for each row execute function public.reject_vehicle_legacy_current_state_entry_mutation();

-- Harden the existing global "one open primary state" invariant so formatting
-- variants such as ABC123 / abc123 / ABC 123 cannot become parallel truths.
-- No historical rows are rewritten. Migration fails rather than repairing data
-- if Production already contains a normalized conflict.
do $$
begin
  if exists (
    select upper(regexp_replace(regnr, '\s+', '', 'g')) as normalized_regnr
    from public.vehicle_journey_periods
    where ended_at is null
    group by upper(regexp_replace(regnr, '\s+', '', 'g'))
    having count(*) > 1
  ) then
    raise exception 'Normalized duplicate open vehicle journey periods exist; migration will not rewrite history';
  end if;
end;
$$;

create unique index if not exists vehicle_journey_periods_one_open_normalized_state_uidx
  on public.vehicle_journey_periods ((upper(regexp_replace(regnr, '\s+', '', 'g'))))
  where ended_at is null;

create or replace function public.establish_legacy_fleet_current_state(
  p_regnr text,
  p_current_state text,
  p_reason_code text,
  p_reason_text text,
  p_evidence_reference text,
  p_identity_snapshot jsonb,
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
  v_verified_at timestamptz := clock_timestamp();
  v_current_state text := upper(trim(coalesce(p_current_state, '')));
  v_reason_code text := nullif(upper(trim(coalesce(p_reason_code, ''))), '');
  v_reason_text text := nullif(trim(coalesce(p_reason_text, '')), '');
  v_evidence_reference text := nullif(trim(coalesce(p_evidence_reference, '')), '');
  v_actor_email text := nullif(lower(trim(coalesce(p_actor_email, ''))), '');
  v_entry_id uuid := gen_random_uuid();
  v_entry public.vehicle_legacy_current_state_entries%rowtype;
  v_result jsonb;
begin
  if v_regnr !~ '^[A-Z]{3}[0-9]{2}[0-9A-Z]$' then
    raise exception 'Invalid regnr' using errcode = '22023';
  end if;

  if v_current_state not in ('AVAILABLE', 'PREPARATION', 'DOWNTIME') then
    raise exception 'LEGACY v1 only permits AVAILABLE, PREPARATION or DOWNTIME'
      using errcode = '22023';
  end if;

  if v_current_state = 'DOWNTIME' then
    if v_reason_code not in (
      'DAMAGE', 'WORKSHOP', 'SERVICE', 'WAITING_PARTS',
      'MISSING_EQUIPMENT', 'TRANSPORT', 'ADMINISTRATION', 'OTHER'
    ) then
      raise exception 'DOWNTIME requires a valid reason' using errcode = '22023';
    end if;
    if v_reason_code = 'OTHER' and v_reason_text is null then
      raise exception 'Other downtime requires a comment' using errcode = '22023';
    end if;
  else
    v_reason_code := null;
    v_reason_text := null;
  end if;

  if v_evidence_reference is null then
    raise exception 'Evidence reference is required' using errcode = '22023';
  end if;

  if p_actor_id is null or v_actor_email is null then
    raise exception 'Verified actor is required' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_identity_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception 'Identity snapshot must be an object' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('vehicle-legacy-current-state:' || v_regnr));

  if exists (
    select 1
    from public.vehicle_legacy_current_state_entries
    where normalized_regnr = v_regnr
  ) then
    raise exception 'LEGACY current-state entry already exists for vehicle'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.vehicle_journey_periods
    where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_regnr
      and ended_at is null
  ) then
    raise exception 'Vehicle already has a current Layer 1 state; LEGACY entry is not permitted'
      using errcode = 'P0001';
  end if;

  -- Closed history is legitimate and remains untouched. A period that reaches
  -- beyond the verification instant would make a new current truth temporally
  -- impossible and is blocked instead of repaired.
  if exists (
    select 1
    from public.vehicle_journey_periods
    where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_regnr
      and (
        started_at > v_verified_at
        or (ended_at is not null and ended_at > v_verified_at)
      )
  ) then
    raise exception 'Existing Layer 1 chronology extends beyond LEGACY verification time'
      using errcode = 'P0001';
  end if;

  insert into public.vehicle_legacy_current_state_entries (
    entry_id,
    regnr,
    normalized_regnr,
    object_type,
    current_state,
    reason_code,
    reason_text,
    verification_method,
    evidence_reference,
    identity_snapshot,
    verified_at,
    verified_by,
    verified_by_email,
    historical_backfill
  ) values (
    v_entry_id,
    v_regnr,
    v_regnr,
    'LEGACY_FLEET',
    v_current_state,
    v_reason_code,
    v_reason_text,
    'MANUAL_CURRENT_STATE_VERIFICATION',
    v_evidence_reference,
    coalesce(p_identity_snapshot, '{}'::jsonb),
    v_verified_at,
    p_actor_id,
    v_actor_email,
    false
  )
  returning * into v_entry;

  v_result := public.transition_vehicle_journey_state(
    gen_random_uuid(),
    v_regnr,
    v_current_state,
    v_verified_at,
    v_reason_code,
    v_reason_text,
    'INCHECKAD',
    'vehicle_legacy_current_state_entries',
    v_entry_id::text,
    p_actor_id,
    'MANUELL',
    v_actor_email,
    jsonb_build_object(
      'sourceKind', 'LEGACY_CURRENT_STATE_ENTRY',
      'objectType', 'LEGACY_FLEET',
      'verificationMethod', 'MANUAL_CURRENT_STATE_VERIFICATION',
      'evidenceReference', v_evidence_reference,
      'historicalBackfill', false,
      'historicalCoverageStartsAt', v_verified_at
    )
  );

  -- transition_vehicle_journey_state is intentionally reused as the Layer 1
  -- engine, but LEGACY must never close a state that appeared concurrently.
  -- Raising here rolls back the entry, period and any temporary close atomically.
  if nullif(v_result ->> 'previousPeriodId', '') is not null then
    raise exception 'A current Layer 1 state appeared during LEGACY verification; entry aborted'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'entry', to_jsonb(v_entry),
    'period', v_result -> 'period'
  );
end;
$$;

revoke all on function public.establish_legacy_fleet_current_state(text,text,text,text,text,jsonb,uuid,text)
  from public, anon, authenticated;
grant execute on function public.establish_legacy_fleet_current_state(text,text,text,text,text,jsonb,uuid,text)
  to service_role;

comment on table public.vehicle_legacy_current_state_entries is
  'Immutable provenance for explicit verification of an existing own fleet vehicle. Establishes current truth from verified_at only; never historical backfill.';

comment on function public.establish_legacy_fleet_current_state(text,text,text,text,text,jsonb,uuid,text) is
  'Atomically verifies LEGACY_FLEET and establishes the first current Layer 1 state at DB-generated verification time. Existing closed history is preserved; existing or concurrent current truth blocks the entry.';

commit;
