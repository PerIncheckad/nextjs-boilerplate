begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Generic append-only timeline for the whole vehicle journey.
-- No FK on regnr yet: current Production has journey-source vehicles that are
-- not present in public.vehicles, so forcing that relation would reject valid history.
create table public.vehicle_journey_events (
  event_id uuid primary key default gen_random_uuid(),
  regnr text not null check (length(trim(regnr)) > 0),
  event_type text not null check (length(trim(event_type)) > 0),
  event_key text,
  occurred_at timestamptz not null default now(),
  source_system text not null default 'INCHECKAD' check (length(trim(source_system)) > 0),
  source_entity text,
  source_record_id text,
  actor_id uuid,
  actor_source text not null default 'SYSTEM'
    check (actor_source in ('SYSTEM', 'MANUELL', 'EXTERNAL')),
  actor_name text,
  actor_email text,
  payload jsonb not null default '{}'::jsonb,
  correction_of_event_id uuid references public.vehicle_journey_events(event_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (event_key),
  check (correction_of_event_id is null or correction_of_event_id <> event_id)
);

create index vehicle_journey_events_regnr_time_idx
  on public.vehicle_journey_events (regnr, occurred_at desc);
create index vehicle_journey_events_source_idx
  on public.vehicle_journey_events (source_system, source_entity, source_record_id)
  where source_record_id is not null;

create or replace function public.reject_vehicle_journey_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'vehicle_journey_events is append-only; write a correcting event instead';
end;
$$;

create trigger vehicle_journey_events_append_only_update
before update on public.vehicle_journey_events
for each row execute function public.reject_vehicle_journey_event_mutation();

create trigger vehicle_journey_events_append_only_delete
before delete on public.vehicle_journey_events
for each row execute function public.reject_vehicle_journey_event_mutation();

create table public.vehicle_journey_periods (
  period_id uuid primary key default gen_random_uuid(),
  regnr text not null check (length(trim(regnr)) > 0),
  period_type text not null
    check (period_type in ('PREPARATION', 'AVAILABLE', 'RENTAL', 'DOWNTIME', 'WORKSHOP', 'TRANSPORT', 'SALU', 'OTHER')),
  started_at timestamptz not null,
  ended_at timestamptz,
  reason_code text,
  reason_text text,
  source_system text not null default 'INCHECKAD' check (length(trim(source_system)) > 0),
  source_entity text,
  source_record_id text,
  source_event_id uuid references public.vehicle_journey_events(event_id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index vehicle_journey_periods_regnr_time_idx
  on public.vehicle_journey_periods (regnr, started_at desc);
create index vehicle_journey_periods_open_idx
  on public.vehicle_journey_periods (regnr, period_type, started_at desc)
  where ended_at is null;

create table public.vehicle_documents (
  document_id uuid primary key default gen_random_uuid(),
  regnr text not null check (length(trim(regnr)) > 0),
  document_type text not null check (length(trim(document_type)) > 0),
  title text,
  storage_bucket text,
  storage_path text,
  external_url text,
  file_name text not null check (length(trim(file_name)) > 0),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  journey_event_id uuid references public.vehicle_journey_events(event_id) on delete restrict,
  checkin_id uuid references public.checkins(id) on delete restrict,
  damage_id uuid references public.damages(id) on delete restrict,
  salu_flag_id uuid references public.salu_flags(flag_id) on delete restrict,
  salu_checkpoint_id uuid references public.salu_checkpoints(checkpoint_id) on delete restrict,
  salu_child_process_id uuid references public.salu_child_processes(child_process_id) on delete restrict,
  source_system text not null default 'INCHECKAD' check (length(trim(source_system)) > 0),
  source_record_id text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid,
  uploaded_by_name text,
  uploaded_by_email text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (storage_bucket is not null and storage_path is not null)
    or external_url is not null
  ),
  check ((storage_bucket is null) = (storage_path is null))
);

create unique index vehicle_documents_storage_object_uidx
  on public.vehicle_documents (storage_bucket, storage_path)
  where storage_bucket is not null;
create index vehicle_documents_regnr_time_idx
  on public.vehicle_documents (regnr, uploaded_at desc);
create index vehicle_documents_event_idx
  on public.vehicle_documents (journey_event_id)
  where journey_event_id is not null;
create index vehicle_documents_checkin_idx
  on public.vehicle_documents (checkin_id)
  where checkin_id is not null;
create index vehicle_documents_damage_idx
  on public.vehicle_documents (damage_id)
  where damage_id is not null;
create index vehicle_documents_salu_flag_idx
  on public.vehicle_documents (salu_flag_id)
  where salu_flag_id is not null;

alter table public.vehicle_journey_events enable row level security;
alter table public.vehicle_journey_periods enable row level security;
alter table public.vehicle_documents enable row level security;

revoke all on public.vehicle_journey_events from public, anon, authenticated;
revoke all on public.vehicle_journey_periods from public, anon, authenticated;
revoke all on public.vehicle_documents from public, anon, authenticated;
revoke execute on function public.reject_vehicle_journey_event_mutation() from public, anon, authenticated;

grant select, insert on public.vehicle_journey_events to service_role;
grant select, insert, update, delete on public.vehicle_journey_periods to service_role;
grant select, insert, update, delete on public.vehicle_documents to service_role;
grant execute on function public.reject_vehicle_journey_event_mutation() to service_role;

commit;
