begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Layer 2.1 establishes only the versioned definition contract for PROCESS -> RUTIN.
-- It does not create a second mutable process state beside existing domain sources.
-- SALU remains source-owned by salu_flags; Layer 1 vehicle-journey state is untouched.
create table public.process_definitions (
  process_code text not null,
  process_version integer not null check (process_version > 0),
  domain text not null check (domain ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$'),
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  owner_function text not null check (length(trim(owner_function)) between 1 and 120),
  trigger_type text not null
    check (trigger_type in ('SOURCE_EVENT', 'SCHEDULED', 'MANUAL', 'EXTERNAL')),
  trigger_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (process_code, process_version),
  check (process_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$'),
  check (jsonb_typeof(trigger_config) = 'object')
);

create unique index process_definitions_one_active_version_uidx
  on public.process_definitions (process_code)
  where active;

create table public.routine_definitions (
  routine_code text not null,
  routine_version integer not null check (routine_version > 0),
  process_code text not null,
  process_version integer not null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  owner_function text not null check (length(trim(owner_function)) between 1 and 120),
  sequence_order integer not null check (sequence_order > 0),
  activation_type text not null
    check (activation_type in ('PROCESS_START', 'PREVIOUS_ROUTINE', 'MANUAL', 'EXTERNAL')),
  activation_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (routine_code, routine_version),
  foreign key (process_code, process_version)
    references public.process_definitions(process_code, process_version)
    on delete restrict,
  check (routine_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$'),
  check (jsonb_typeof(activation_config) = 'object')
);

create unique index routine_definitions_one_active_version_uidx
  on public.routine_definitions (routine_code)
  where active;

create index routine_definitions_process_idx
  on public.routine_definitions (process_code, process_version, sequence_order);

-- First vertical case is the already locked SALU domain. This seed describes
-- the contract only; it does not backfill, mutate or duplicate salu_flags.
insert into public.process_definitions (
  process_code,
  process_version,
  domain,
  title,
  description,
  owner_function,
  trigger_type,
  trigger_config,
  active
) values (
  'SALU',
  1,
  'SALU',
  'SALU',
  'Bilens slutkontroll och beslutspunkt inom den sammanhängande fordonsresan.',
  'BILKONTROLL',
  'SOURCE_EVENT',
  pg_catalog.jsonb_build_object(
    'sourceSystem', 'INCHECKAD',
    'sourceEntity', 'salu_flags',
    'sourceRecordField', 'flag_id',
    'subjectField', 'regnr',
    'eventType', 'SALU_FLAG_CREATED'
  ),
  true
)
on conflict (process_code, process_version) do nothing;

insert into public.routine_definitions (
  routine_code,
  routine_version,
  process_code,
  process_version,
  title,
  description,
  owner_function,
  sequence_order,
  activation_type,
  activation_config,
  active
) values (
  'SALU_CYCLE',
  1,
  'SALU',
  1,
  'SALU-cykel',
  'Den källägda SALU-cykeln från aktiv flagga till verifierat slutbeslut.',
  'BILKONTROLL',
  1,
  'PROCESS_START',
  pg_catalog.jsonb_build_object(
    'sourceEntity', 'salu_flags',
    'sourceStateField', 'status',
    'sourceOwner', 'SALU'
  ),
  true
)
on conflict (routine_code, routine_version) do nothing;

alter table public.process_definitions enable row level security;
alter table public.routine_definitions enable row level security;

revoke all on public.process_definitions from public, anon, authenticated;
revoke all on public.routine_definitions from public, anon, authenticated;

grant select, insert, update, delete on public.process_definitions to service_role;
grant select, insert, update, delete on public.routine_definitions to service_role;

commit;
