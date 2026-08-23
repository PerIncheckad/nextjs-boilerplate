begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Layer 2.6: business-specific SLA/timer contract.
-- Existing SALU scheduler remains source owner. Layer 2 only projects verified
-- timer milestones into a common SLA timeline; it does not schedule duplicates.
create table public.routine_sla_definitions (
  sla_code text not null,
  sla_version integer not null check (sla_version > 0),
  routine_code text not null,
  routine_version integer not null,
  title text not null check (length(trim(title)) between 1 and 200),
  timing_kind text not null check (timing_kind in ('MILESTONE','RECURRING_REMINDER')),
  anchor_type text not null check (anchor_type in ('SALUDATUM','FLAG_CREATED')),
  offset_days integer,
  interval_days integer,
  source_system text not null,
  source_entity text not null,
  source_event_type text not null,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (sla_code, sla_version),
  foreign key (routine_code, routine_version)
    references public.routine_definitions(routine_code, routine_version)
    on delete restrict,
  check (sla_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$'),
  check (
    (timing_kind = 'MILESTONE' and offset_days is not null and interval_days is null)
    or
    (timing_kind = 'RECURRING_REMINDER' and interval_days is not null and interval_days > 0)
  )
);

create unique index routine_sla_one_active_version_uidx
  on public.routine_sla_definitions (sla_code)
  where active;

create index routine_sla_source_match_idx
  on public.routine_sla_definitions (source_system, source_entity, source_event_type, active);

create table public.routine_sla_events (
  sla_event_id uuid primary key default gen_random_uuid(),
  sla_code text not null,
  sla_version integer not null,
  source_salu_event_id uuid not null references public.salu_events(event_id) on delete restrict,
  routine_code text not null,
  routine_version integer not null,
  regnr text not null,
  flag_id uuid,
  source_event_type text not null,
  source_event_key text,
  source_occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (sla_code, sla_version)
    references public.routine_sla_definitions(sla_code, sla_version)
    on delete restrict,
  foreign key (routine_code, routine_version)
    references public.routine_definitions(routine_code, routine_version)
    on delete restrict,
  unique (sla_code, sla_version, source_salu_event_id),
  check (jsonb_typeof(payload) = 'object')
);

create index routine_sla_events_regnr_time_idx
  on public.routine_sla_events (regnr, source_occurred_at desc);

create or replace function public.reject_routine_sla_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'routine_sla_events is append-only';
end;
$$;

create trigger routine_sla_events_append_only_update
before update on public.routine_sla_events
for each row execute function public.reject_routine_sla_event_mutation();

create trigger routine_sla_events_append_only_delete
before delete on public.routine_sla_events
for each row execute function public.reject_routine_sla_event_mutation();

create or replace function public.materialize_salu_routine_sla_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_definition record;
begin
  for v_definition in
    select d.*
    from public.routine_sla_definitions d
    where d.active
      and d.source_system = 'SALU'
      and d.source_entity = 'salu_events'
      and d.source_event_type = new.event_type
    order by d.sla_code, d.sla_version
  loop
    insert into public.routine_sla_events (
      sla_code,
      sla_version,
      source_salu_event_id,
      routine_code,
      routine_version,
      regnr,
      flag_id,
      source_event_type,
      source_event_key,
      source_occurred_at,
      payload
    ) values (
      v_definition.sla_code,
      v_definition.sla_version,
      new.event_id,
      v_definition.routine_code,
      v_definition.routine_version,
      upper(trim(new.regnr)),
      new.flag_id,
      new.event_type,
      new.event_key,
      new.occurred_at,
      pg_catalog.jsonb_build_object('sourcePayload', new.payload)
    )
    on conflict (sla_code, sla_version, source_salu_event_id) do nothing;
  end loop;

  return new;
end;
$$;

insert into public.routine_sla_definitions (
  sla_code, sla_version, routine_code, routine_version, title,
  timing_kind, anchor_type, offset_days, interval_days,
  source_system, source_entity, source_event_type, active
) values
  ('SALU_T30_START', 1, 'SALU_CYCLE', 1, 'SALU T-30 start',
   'MILESTONE', 'SALUDATUM', -30, null, 'SALU', 'salu_events', 'SALU_FLAG_CREATED', true),
  ('SALU_T10_ESCALATION', 1, 'SALU_CYCLE', 1, 'SALU T-10 escalation',
   'MILESTONE', 'SALUDATUM', -10, null, 'SALU', 'salu_events', 'SALU_T10_ESCALATED', true),
  ('SALU_T0_ESCALATION', 1, 'SALU_CYCLE', 1, 'SALU T0 escalation',
   'MILESTONE', 'SALUDATUM', 0, null, 'SALU', 'salu_events', 'SALU_T0_PASSED', true),
  ('SALU_DECISION_REMINDER', 1, 'SALU_CYCLE', 1, 'SALU decision reminder',
   'RECURRING_REMINDER', 'FLAG_CREATED', null, 10, 'SALU', 'salu_events', 'SALU_DECISION_REMINDER_DUE', true)
on conflict (sla_code, sla_version) do nothing;

create trigger salu_events_materialize_routine_sla
after insert on public.salu_events
for each row
when (new.event_type in ('SALU_FLAG_CREATED','SALU_T10_ESCALATED','SALU_T0_PASSED','SALU_DECISION_REMINDER_DUE'))
execute function public.materialize_salu_routine_sla_event();

alter table public.routine_sla_definitions enable row level security;
alter table public.routine_sla_events enable row level security;

revoke all on public.routine_sla_definitions from public, anon, authenticated;
revoke all on public.routine_sla_events from public, anon, authenticated;
revoke all on function public.reject_routine_sla_event_mutation() from public, anon, authenticated;
revoke all on function public.materialize_salu_routine_sla_event() from public, anon, authenticated;

grant select, insert, update, delete on public.routine_sla_definitions to service_role;
grant select, insert on public.routine_sla_events to service_role;
grant execute on function public.reject_routine_sla_event_mutation() to service_role;
grant execute on function public.materialize_salu_routine_sla_event() to service_role;

-- No historical backfill. Existing SALU scheduler remains the only timer writer.
commit;
