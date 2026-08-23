begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Layer 2.4: Layer 1 source-trigger adapters.
-- This layer may observe verified Layer 1 journey events and emit Layer 2 trigger facts.
-- It never mutates Layer 1 facts and never invents a process mapping that has not been configured.
create table public.source_trigger_adapter_definitions (
  adapter_code text not null,
  adapter_version integer not null check (adapter_version > 0),
  source_layer text not null default 'LAYER1' check (source_layer = 'LAYER1'),
  source_system text not null check (length(trim(source_system)) between 1 and 120),
  source_entity text not null check (length(trim(source_entity)) between 1 and 120),
  source_event_type text not null check (length(trim(source_event_type)) between 1 and 160),
  process_code text not null,
  process_version integer not null,
  routine_code text,
  routine_version integer,
  active boolean not null default false,
  valid_from timestamptz not null default now(),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (adapter_code, adapter_version),
  foreign key (process_code, process_version)
    references public.process_definitions(process_code, process_version)
    on delete restrict,
  foreign key (routine_code, routine_version)
    references public.routine_definitions(routine_code, routine_version)
    on delete restrict,
  check (adapter_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$'),
  check ((routine_code is null) = (routine_version is null))
);

create unique index source_trigger_adapter_one_active_version_uidx
  on public.source_trigger_adapter_definitions (adapter_code)
  where active;

create index source_trigger_adapter_match_idx
  on public.source_trigger_adapter_definitions (
    source_system,
    source_entity,
    source_event_type,
    active
  );

create table public.process_trigger_events (
  process_trigger_event_id uuid primary key default gen_random_uuid(),
  adapter_code text not null,
  adapter_version integer not null,
  source_journey_event_id uuid not null
    references public.vehicle_journey_events(event_id) on delete restrict,
  process_code text not null,
  process_version integer not null,
  routine_code text,
  routine_version integer,
  regnr text not null check (length(trim(regnr)) > 0),
  source_system text not null,
  source_entity text not null,
  source_record_id text,
  source_event_type text not null,
  source_event_key text,
  source_occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (adapter_code, adapter_version)
    references public.source_trigger_adapter_definitions(adapter_code, adapter_version)
    on delete restrict,
  foreign key (process_code, process_version)
    references public.process_definitions(process_code, process_version)
    on delete restrict,
  foreign key (routine_code, routine_version)
    references public.routine_definitions(routine_code, routine_version)
    on delete restrict,
  unique (adapter_code, adapter_version, source_journey_event_id),
  check ((routine_code is null) = (routine_version is null)),
  check (jsonb_typeof(payload) = 'object')
);

create index process_trigger_events_regnr_time_idx
  on public.process_trigger_events (regnr, source_occurred_at desc);
create index process_trigger_events_process_idx
  on public.process_trigger_events (process_code, process_version, source_occurred_at desc);

create or replace function public.reject_process_trigger_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'process_trigger_events is append-only; write a new source event instead';
end;
$$;

create trigger process_trigger_events_append_only_update
before update on public.process_trigger_events
for each row execute function public.reject_process_trigger_event_mutation();

create trigger process_trigger_events_append_only_delete
before delete on public.process_trigger_events
for each row execute function public.reject_process_trigger_event_mutation();

create or replace function public.materialize_layer2_process_trigger_from_layer1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_adapter record;
begin
  for v_adapter in
    select d.*
    from public.source_trigger_adapter_definitions d
    where d.active
      and d.source_layer = 'LAYER1'
      and d.source_system = new.source_system
      and d.source_entity = coalesce(new.source_entity, 'vehicle_journey_events')
      and d.source_event_type = new.event_type
    order by d.adapter_code, d.adapter_version
  loop
    insert into public.process_trigger_events (
      adapter_code,
      adapter_version,
      source_journey_event_id,
      process_code,
      process_version,
      routine_code,
      routine_version,
      regnr,
      source_system,
      source_entity,
      source_record_id,
      source_event_type,
      source_event_key,
      source_occurred_at,
      payload
    ) values (
      v_adapter.adapter_code,
      v_adapter.adapter_version,
      new.event_id,
      v_adapter.process_code,
      v_adapter.process_version,
      v_adapter.routine_code,
      v_adapter.routine_version,
      upper(trim(new.regnr)),
      new.source_system,
      coalesce(new.source_entity, 'vehicle_journey_events'),
      new.source_record_id,
      new.event_type,
      new.event_key,
      new.occurred_at,
      pg_catalog.jsonb_build_object(
        'sourcePayload', new.payload,
        'actorId', new.actor_id,
        'actorSource', new.actor_source,
        'actorName', new.actor_name,
        'actorEmail', new.actor_email,
        'correctionOfEventId', new.correction_of_event_id
      )
    )
    on conflict (adapter_code, adapter_version, source_journey_event_id)
    do nothing;
  end loop;

  return new;
end;
$$;

create trigger vehicle_journey_events_layer2_process_trigger
after insert on public.vehicle_journey_events
for each row execute function public.materialize_layer2_process_trigger_from_layer1();

alter table public.source_trigger_adapter_definitions enable row level security;
alter table public.process_trigger_events enable row level security;

revoke all on public.source_trigger_adapter_definitions from public, anon, authenticated;
revoke all on public.process_trigger_events from public, anon, authenticated;
revoke all on function public.reject_process_trigger_event_mutation() from public, anon, authenticated;
revoke all on function public.materialize_layer2_process_trigger_from_layer1() from public, anon, authenticated;

grant select, insert, update, delete on public.source_trigger_adapter_definitions to service_role;
grant select, insert on public.process_trigger_events to service_role;
grant execute on function public.reject_process_trigger_event_mutation() to service_role;
grant execute on function public.materialize_layer2_process_trigger_from_layer1() to service_role;

-- Intentionally no active adapter seed in v1.
-- The revisionsakt explicitly requires each business trigger to be written as a business rule first.

commit;
