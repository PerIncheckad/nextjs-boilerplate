begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Hjulskifte is an operational Garage workflow. The checkpoint is Layer 2 control;
-- it does not change the vehicle's Layer 1 state or create an ANKOMST fact.
insert into public.checkpoint_definitions (
  checkpoint_code,
  definition_version,
  domain,
  title,
  description,
  owner_function,
  verification_mode,
  blocking,
  trigger_type,
  trigger_config,
  active
) values (
  'HJULSKIFTE',
  1,
  'SERVICE',
  'Hjulskifte',
  'Operativ kontrollpunkt för planering, bokning, genomförande och verifiering av hjulskifte i Garaget.',
  'BILKONTROLL',
  'MANUELL',
  false,
  'GARAGE_MANUAL',
  '{"source":"GARAGE"}'::jsonb,
  true
)
on conflict (checkpoint_code, definition_version) do nothing;

create table public.garage_wheel_changes (
  wheel_change_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  regnr text not null check (length(trim(regnr)) > 0),
  checkpoint_id uuid not null references public.vehicle_checkpoints(checkpoint_id) on delete restrict,
  status text not null default 'KRAVS'
    check (status in ('KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE')),
  booked_for timestamptz,
  supplier text,
  location text,
  note text,
  completed_at timestamptz,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  check (status <> 'BOKAD' or booked_for is not null),
  check (status <> 'AVVIKELSE' or length(trim(coalesce(note, ''))) > 0),
  check ((status = 'KLAR') = (completed_at is not null))
);

create unique index garage_wheel_changes_one_open_per_item_uidx
  on public.garage_wheel_changes (garage_item_id)
  where status <> 'KLAR';
create index garage_wheel_changes_regnr_status_idx
  on public.garage_wheel_changes (regnr, status, booked_for);
create index garage_wheel_changes_checkpoint_idx
  on public.garage_wheel_changes (checkpoint_id);

create table public.garage_wheel_change_events (
  wheel_change_event_id uuid primary key default gen_random_uuid(),
  wheel_change_id uuid not null references public.garage_wheel_changes(wheel_change_id) on delete restrict,
  event_type text not null check (event_type in ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'COMPLETED')),
  previous_status text check (previous_status is null or previous_status in ('KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE')),
  status text not null check (status in ('KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE')),
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  actor_id uuid,
  actor_email text,
  occurred_at timestamptz not null default now()
);

create index garage_wheel_change_events_change_time_idx
  on public.garage_wheel_change_events (wheel_change_id, occurred_at desc);

create or replace function public.reject_garage_wheel_change_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'garage_wheel_change_events is append-only; write a new event instead';
end;
$$;

create trigger garage_wheel_change_events_append_only_update
before update on public.garage_wheel_change_events
for each row execute function public.reject_garage_wheel_change_event_mutation();

create trigger garage_wheel_change_events_append_only_delete
before delete on public.garage_wheel_change_events
for each row execute function public.reject_garage_wheel_change_event_mutation();

create or replace function public.create_garage_wheel_change(
  p_garage_item_id uuid,
  p_note text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_item public.garage_items%rowtype;
  v_definition public.checkpoint_definitions%rowtype;
  v_checkpoint public.vehicle_checkpoints%rowtype;
  v_change public.garage_wheel_changes%rowtype;
  v_wheel_change_id uuid := gen_random_uuid();
  v_regnr text;
begin
  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage item not found' using errcode = 'P0002';
  end if;

  v_regnr := upper(regexp_replace(coalesce(v_item.regnr, ''), '\s+', '', 'g'));
  if length(v_regnr) = 0 then
    raise exception 'Registreringsnummer krävs för hjulskifte' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.garage_wheel_changes
    where garage_item_id = p_garage_item_id and status <> 'KLAR'
  ) then
    raise exception 'Ett aktivt hjulskifte finns redan för Garage-objektet' using errcode = 'P0001';
  end if;

  select * into v_definition
  from public.checkpoint_definitions
  where checkpoint_code = 'HJULSKIFTE' and active
  order by definition_version desc
  limit 1;

  if not found then
    raise exception 'Active HJULSKIFTE checkpoint definition not found' using errcode = 'P0002';
  end if;

  insert into public.vehicle_checkpoints (
    regnr,
    checkpoint_code,
    definition_version,
    cycle_key,
    due_at,
    source_context,
    created_by,
    updated_by
  ) values (
    v_regnr,
    v_definition.checkpoint_code,
    v_definition.definition_version,
    'garage-wheel:' || v_wheel_change_id::text,
    null,
    jsonb_build_object(
      'garageItemId', p_garage_item_id,
      'wheelChangeId', v_wheel_change_id,
      'source', 'GARAGE'
    ),
    p_actor_id,
    p_actor_id
  ) returning * into v_checkpoint;

  insert into public.garage_wheel_changes (
    wheel_change_id,
    garage_item_id,
    regnr,
    checkpoint_id,
    status,
    note,
    created_by,
    created_by_email,
    updated_by,
    updated_by_email
  ) values (
    v_wheel_change_id,
    p_garage_item_id,
    v_regnr,
    v_checkpoint.checkpoint_id,
    'KRAVS',
    nullif(trim(coalesce(p_note, '')), ''),
    p_actor_id,
    p_actor_email,
    p_actor_id,
    p_actor_email
  ) returning * into v_change;

  insert into public.garage_wheel_change_events (
    wheel_change_id, event_type, previous_status, status, snapshot, actor_id, actor_email
  ) values (
    v_change.wheel_change_id,
    'CREATED',
    null,
    v_change.status,
    jsonb_build_object(
      'garageItemId', v_change.garage_item_id,
      'regnr', v_change.regnr,
      'checkpointId', v_change.checkpoint_id,
      'note', v_change.note
    ),
    p_actor_id,
    p_actor_email
  );

  insert into public.vehicle_journey_events (
    regnr,
    event_type,
    event_key,
    occurred_at,
    source_system,
    source_entity,
    source_record_id,
    actor_id,
    actor_source,
    actor_email,
    payload
  ) values (
    v_regnr,
    'CHECKPOINT_CREATED',
    'checkpoint-created:' || v_checkpoint.checkpoint_id::text,
    now(),
    'CHECKPOINT_ENGINE',
    'vehicle_checkpoints',
    v_checkpoint.checkpoint_id::text,
    p_actor_id,
    'MANUELL',
    p_actor_email,
    jsonb_build_object(
      'checkpointId', v_checkpoint.checkpoint_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'definitionVersion', v_checkpoint.definition_version,
      'cycleKey', v_checkpoint.cycle_key,
      'blocking', v_definition.blocking,
      'verificationMode', v_definition.verification_mode,
      'source', 'GARAGE'
    )
  );

  return to_jsonb(v_change);
end;
$$;

create or replace function public.update_garage_wheel_change(
  p_wheel_change_id uuid,
  p_status text,
  p_booked_for timestamptz,
  p_supplier text,
  p_location text,
  p_note text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_change public.garage_wheel_changes%rowtype;
  v_previous_status text;
  v_next_status text;
  v_event_type text := 'UPDATED';
  v_allowed boolean := false;
begin
  select * into v_change
  from public.garage_wheel_changes
  where wheel_change_id = p_wheel_change_id
  for update;

  if not found then
    raise exception 'Hjulskifte not found' using errcode = 'P0002';
  end if;

  if v_change.status = 'KLAR' then
    raise exception 'Ett verifierat hjulskifte är avslutat och kan inte ändras' using errcode = 'P0001';
  end if;

  v_previous_status := v_change.status;
  v_next_status := upper(trim(coalesce(p_status, v_change.status)));

  if v_next_status not in ('KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE') then
    raise exception 'Invalid wheel change status' using errcode = '22023';
  end if;

  v_allowed := case
    when v_change.status = 'KRAVS' and v_next_status in ('KRAVS', 'BOKAD', 'PAGAENDE', 'AVVIKELSE') then true
    when v_change.status = 'BOKAD' and v_next_status in ('KRAVS', 'BOKAD', 'PAGAENDE', 'AVVIKELSE') then true
    when v_change.status = 'PAGAENDE' and v_next_status in ('BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE') then true
    when v_change.status = 'AVVIKELSE' and v_next_status in ('KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE') then true
    else false
  end;

  if not v_allowed then
    raise exception 'Invalid wheel change transition % -> %', v_change.status, v_next_status using errcode = '22023';
  end if;

  if v_next_status = 'BOKAD' and p_booked_for is null then
    raise exception 'Bokad tid krävs när hjulskiftet är BOKAD' using errcode = '22023';
  end if;

  if v_next_status = 'AVVIKELSE' and length(trim(coalesce(p_note, v_change.note, ''))) = 0 then
    raise exception 'Avvikelse kräver kommentar' using errcode = '22023';
  end if;

  update public.garage_wheel_changes
  set status = v_next_status,
      booked_for = p_booked_for,
      supplier = nullif(trim(coalesce(p_supplier, '')), ''),
      location = nullif(trim(coalesce(p_location, '')), ''),
      note = nullif(trim(coalesce(p_note, '')), ''),
      completed_at = case when v_next_status = 'KLAR' then now() else null end,
      updated_by = p_actor_id,
      updated_by_email = p_actor_email,
      updated_at = now()
  where wheel_change_id = p_wheel_change_id
  returning * into v_change;

  update public.vehicle_checkpoints
  set due_at = case when v_next_status = 'BOKAD' then p_booked_for else due_at end,
      updated_by = p_actor_id,
      updated_at = now()
  where checkpoint_id = v_change.checkpoint_id;

  if v_next_status = 'AVVIKELSE' and v_previous_status <> 'AVVIKELSE' then
    perform public.assess_vehicle_checkpoint(
      v_change.checkpoint_id,
      'AVVIKELSE',
      coalesce(v_change.note, 'Hjulskifte avvikelse'),
      '[]'::jsonb,
      p_actor_id,
      p_actor_email,
      'MANUELL'
    );
  elsif v_next_status = 'KLAR' then
    perform public.assess_vehicle_checkpoint(
      v_change.checkpoint_id,
      'GODKAND',
      coalesce(v_change.note, 'Hjulskifte verifierat klart'),
      '[]'::jsonb,
      p_actor_id,
      p_actor_email,
      'MANUELL'
    );
  end if;

  if v_next_status = 'KLAR' then
    v_event_type := 'COMPLETED';
  elsif v_next_status <> v_previous_status then
    v_event_type := 'STATUS_CHANGED';
  end if;

  insert into public.garage_wheel_change_events (
    wheel_change_id, event_type, previous_status, status, snapshot, actor_id, actor_email
  ) values (
    v_change.wheel_change_id,
    v_event_type,
    v_previous_status,
    v_change.status,
    jsonb_build_object(
      'bookedFor', v_change.booked_for,
      'supplier', v_change.supplier,
      'location', v_change.location,
      'note', v_change.note,
      'completedAt', v_change.completed_at
    ),
    p_actor_id,
    p_actor_email
  );

  return to_jsonb(v_change);
end;
$$;

alter table public.garage_wheel_changes enable row level security;
alter table public.garage_wheel_change_events enable row level security;

revoke all on public.garage_wheel_changes from public, anon, authenticated;
revoke all on public.garage_wheel_change_events from public, anon, authenticated;
revoke all on function public.reject_garage_wheel_change_event_mutation() from public, anon, authenticated;
revoke all on function public.create_garage_wheel_change(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.update_garage_wheel_change(uuid, text, timestamptz, text, text, text, uuid, text) from public, anon, authenticated;

grant select, insert, update on public.garage_wheel_changes to service_role;
grant select, insert on public.garage_wheel_change_events to service_role;
grant execute on function public.reject_garage_wheel_change_event_mutation() to service_role;
grant execute on function public.create_garage_wheel_change(uuid, text, uuid, text) to service_role;
grant execute on function public.update_garage_wheel_change(uuid, text, timestamptz, text, text, text, uuid, text) to service_role;

commit;
