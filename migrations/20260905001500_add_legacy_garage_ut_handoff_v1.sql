begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- LEGACY current-state verification and Garage disposition are separate business
-- events. This handoff only creates the Garage work object from already verified
-- current truth; it never manufactures SALU/Nybil history or rewrites Layer 1.
alter table public.garage_items
  add column if not exists source_legacy_entry_id uuid;

alter table public.garage_items
  drop constraint if exists garage_items_source_legacy_entry_id_fkey,
  add constraint garage_items_source_legacy_entry_id_fkey
    foreign key (source_legacy_entry_id)
    references public.vehicle_legacy_current_state_entries(entry_id)
    on delete restrict;

alter table public.garage_items
  drop constraint if exists garage_items_legacy_source_coherence_check,
  add constraint garage_items_legacy_source_coherence_check
  check (
    source_legacy_entry_id is null
    or (
      source_kind = 'LAGER1'
      and source_journey_period_id is not null
      and regnr is not null
      and garage_direction = 'UT'
    )
  );

create unique index if not exists garage_items_active_legacy_source_uidx
  on public.garage_items(source_legacy_entry_id)
  where source_legacy_entry_id is not null and voided_at is null;

comment on column public.garage_items.source_legacy_entry_id is
  'Exact immutable LEGACY_FLEET current-state entry that authorized this Garage UT materialization. Layer 1 remains the immediate Garage source; this column preserves the upstream LEGACY provenance.';

create table public.garage_legacy_handoffs (
  handoff_id uuid primary key default gen_random_uuid(),
  legacy_entry_id uuid not null references public.vehicle_legacy_current_state_entries(entry_id) on delete restrict,
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  journey_period_id uuid not null references public.vehicle_journey_periods(period_id) on delete restrict,
  regnr text not null check (length(trim(regnr)) > 0),
  planned_station text not null references public.planning_stations(station_code) on delete restrict,
  handoff_type text not null default 'LEGACY_FLEET_TO_GARAGE_UT'
    check (handoff_type = 'LEGACY_FLEET_TO_GARAGE_UT'),
  occurred_at timestamptz not null,
  actor_id uuid not null,
  actor_email text not null check (length(trim(actor_email)) > 0),
  historical_backfill boolean not null default false check (historical_backfill = false),
  created_at timestamptz not null default now(),
  unique (garage_item_id)
);

alter table public.garage_legacy_handoffs enable row level security;
revoke all on public.garage_legacy_handoffs from public, anon, authenticated;
grant all on public.garage_legacy_handoffs to service_role;

create or replace function public.reject_garage_legacy_handoff_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'garage_legacy_handoffs is append-only; create a new handoff event instead';
end;
$$;

revoke all on function public.reject_garage_legacy_handoff_mutation()
  from public, anon, authenticated;
grant execute on function public.reject_garage_legacy_handoff_mutation()
  to service_role;

create trigger garage_legacy_handoffs_append_only_update
before update on public.garage_legacy_handoffs
for each row execute function public.reject_garage_legacy_handoff_mutation();

create trigger garage_legacy_handoffs_append_only_delete
before delete on public.garage_legacy_handoffs
for each row execute function public.reject_garage_legacy_handoff_mutation();

create or replace function public.materialize_legacy_fleet_to_garage_ut(
  p_legacy_entry_id uuid,
  p_planned_station text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_legacy public.vehicle_legacy_current_state_entries%rowtype;
  v_period public.vehicle_journey_periods%rowtype;
  v_item public.garage_items%rowtype;
  v_handoff public.garage_legacy_handoffs%rowtype;
  v_regnr text;
  v_station text := nullif(trim(coalesce(p_planned_station, '')), '');
  v_actor_email text := nullif(lower(trim(coalesce(p_actor_email, ''))), '');
  v_model text;
  v_now timestamptz := clock_timestamp();
begin
  if p_legacy_entry_id is null then
    raise exception 'LEGACY entry krävs' using errcode = '22023';
  end if;
  if p_actor_id is null or v_actor_email is null then
    raise exception 'Verifierad aktör krävs' using errcode = '22023';
  end if;
  if v_station is null then
    raise exception 'Aktuell station måste väljas explicit' using errcode = '22023';
  end if;

  select * into v_legacy
  from public.vehicle_legacy_current_state_entries
  where entry_id = p_legacy_entry_id
  for share;

  if not found then
    raise exception 'LEGACY-entryn finns inte' using errcode = 'P0002';
  end if;
  if v_legacy.object_type <> 'LEGACY_FLEET' or v_legacy.historical_backfill then
    raise exception 'Endast verifierad LEGACY_FLEET utan historisk backfill får lämnas till Garage'
      using errcode = 'P0001';
  end if;

  v_regnr := v_legacy.normalized_regnr;
  perform pg_advisory_xact_lock(hashtext('legacy-garage-ut:' || v_regnr));

  if not exists (
    select 1
    from public.planning_stations
    where station_code = v_station
      and is_active = true
  ) then
    raise exception 'Vald Garage-station är inte en aktiv huvudstation' using errcode = '22023';
  end if;

  -- The immutable LEGACY entry must really be the origin of a Layer 1 period.
  -- This verifies the chain without requiring the original period to still be open;
  -- later legitimate Layer 1 transitions may have occurred after the bootstrap.
  if not exists (
    select 1
    from public.vehicle_journey_periods p
    where upper(regexp_replace(p.regnr, '\s+', '', 'g')) = v_regnr
      and p.source_entity = 'vehicle_legacy_current_state_entries'
      and p.source_record_id = v_legacy.entry_id::text
      and p.started_at = v_legacy.verified_at
  ) then
    raise exception 'LEGACY-proveniens saknar verifierbar Layer 1-start; Garage-handslag stoppat'
      using errcode = 'P0001';
  end if;

  select * into v_period
  from public.vehicle_journey_periods
  where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_regnr
    and ended_at is null
  order by started_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Bilen saknar aktuell Layer 1-period; Garage-handslag stoppat' using errcode = 'P0001';
  end if;
  if v_period.started_at < v_legacy.verified_at then
    raise exception 'Aktuell Layer 1-period föregår LEGACY-verifieringen; Garage-handslag stoppat'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.garage_items gi
    where gi.voided_at is null
      and gi.completed_at is null
      and gi.handed_off_nybil_id is null
      and (
        upper(regexp_replace(coalesce(gi.regnr, ''), '\s+', '', 'g')) = v_regnr
        or upper(regexp_replace(coalesce(gi.source_regnr, ''), '\s+', '', 'g')) = v_regnr
      )
  ) then
    raise exception 'Bilen har redan ett aktivt Garage-objekt' using errcode = 'P0001';
  end if;

  v_model := nullif(trim(coalesce(
    v_legacy.identity_snapshot #>> '{vehicleCatalogObservation,model}',
    ''
  )), '');

  if v_model is null then
    raise exception 'LEGACY-identitetens snapshot saknar modell; Garage-handslag kan inte skapas'
      using errcode = 'P0001';
  end if;

  insert into public.garage_items (
    model,
    planning_reason,
    regnr,
    source_regnr,
    planned_station,
    confirmation_status,
    transport_status,
    garage_direction,
    source_kind,
    source_journey_period_id,
    source_journey_event_id,
    source_legacy_entry_id,
    created_at,
    updated_at,
    created_by,
    updated_by
  ) values (
    v_model,
    'ANNAT',
    v_regnr,
    v_regnr,
    v_station,
    'PLANERAD',
    'EJ_BOKAD',
    'UT',
    'LAGER1',
    v_period.period_id,
    v_period.source_event_id,
    v_legacy.entry_id,
    v_now,
    v_now,
    p_actor_id,
    p_actor_id
  )
  returning * into v_item;

  insert into public.garage_direction_events (
    garage_item_id,
    from_direction,
    to_direction,
    reason,
    changed_at,
    changed_by
  ) values (
    v_item.garage_item_id,
    null,
    'UT',
    'Verifierat LEGACY_FLEET → Garage AVVECKLA / UT-handslag',
    v_now,
    p_actor_id
  );

  insert into public.garage_legacy_handoffs (
    legacy_entry_id,
    garage_item_id,
    journey_period_id,
    regnr,
    planned_station,
    handoff_type,
    occurred_at,
    actor_id,
    actor_email,
    historical_backfill
  ) values (
    v_legacy.entry_id,
    v_item.garage_item_id,
    v_period.period_id,
    v_regnr,
    v_station,
    'LEGACY_FLEET_TO_GARAGE_UT',
    v_now,
    p_actor_id,
    v_actor_email,
    false
  )
  returning * into v_handoff;

  return jsonb_build_object(
    'garageItem', to_jsonb(v_item),
    'handoff', to_jsonb(v_handoff),
    'legacyEntryId', v_legacy.entry_id,
    'journeyPeriodId', v_period.period_id,
    'historicalBackfill', false
  );
end;
$$;

revoke all on function public.materialize_legacy_fleet_to_garage_ut(uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.materialize_legacy_fleet_to_garage_ut(uuid,text,uuid,text)
  to service_role;

comment on table public.garage_legacy_handoffs is
  'Append-only verified handshakes from immutable LEGACY_FLEET current-state provenance into an ordinary Garage AVVECKLA / UT work object. No historical backfill.';

comment on function public.materialize_legacy_fleet_to_garage_ut(uuid,text,uuid,text) is
  'Atomically verifies LEGACY provenance + current Layer 1 + explicit current station, creates one Garage UT object and records an immutable handoff. Does not start AVVECKLA, change Layer 1 or reconstruct history.';

commit;
