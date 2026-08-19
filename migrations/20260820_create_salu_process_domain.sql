-- 4.1B SALU persistence contract.
--
-- This migration defines storage for the locked SALU process semantics without
-- backfilling existing vehicles, creating synthetic business events, or adding
-- browser-facing policies. Application writes remain server-side only.

begin;

create table if not exists public.salu_auto_rules (
  rule_id uuid not null default gen_random_uuid(),
  rule_version integer not null check (rule_version > 0),
  make text not null,
  model_tokens text[] not null default '{}',
  months integer not null check (months > 0),
  priority integer not null default 0,
  active boolean not null default true,
  valid_from date not null default current_date,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (rule_id, rule_version)
);

create index if not exists salu_auto_rules_match_idx
  on public.salu_auto_rules (upper(make), active, priority desc, valid_from desc);

create table if not exists public.salu_stillestand_causes (
  cause_code text primary key,
  label text not null,
  active boolean not null default true,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

insert into public.salu_stillestand_causes (cause_code, label)
values
  ('TRANSPORT', 'Transport'),
  ('REPARATION', 'Reparation'),
  ('ANNAN_ORSAK', 'Annan orsak')
on conflict (cause_code) do nothing;

create table if not exists public.salu_vehicle_state (
  regnr text primary key,
  ny_date date not null,
  original_saludatum date,
  current_saludatum date,
  control_mode text check (control_mode in ('AUTO', 'MANUELL')),
  manual_months integer check (manual_months is null or manual_months > 0),
  auto_rule_id uuid,
  auto_rule_version integer,
  auto_months_applied integer check (auto_months_applied is null or auto_months_applied > 0),
  final_slutbedomning_at timestamptz,
  final_closed_at timestamptz,
  stillestand_salu_days integer check (stillestand_salu_days is null or stillestand_salu_days >= 0),
  stillestand_cause_code text references public.salu_stillestand_causes(cause_code),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  foreign key (auto_rule_id, auto_rule_version)
    references public.salu_auto_rules(rule_id, rule_version),
  check ((auto_rule_id is null) = (auto_rule_version is null)),
  check (current_saludatum is null or current_saludatum >= ny_date),
  check (original_saludatum is null or original_saludatum >= ny_date),
  check (final_closed_at is null or final_slutbedomning_at is not null),
  check (final_closed_at is null or final_closed_at >= final_slutbedomning_at),
  check (stillestand_salu_days is null or stillestand_salu_days < 4 or stillestand_cause_code is not null)
);

create table if not exists public.salu_flags (
  flag_id uuid primary key default gen_random_uuid(),
  regnr text not null references public.salu_vehicle_state(regnr) on delete restrict,
  previous_flag_id uuid references public.salu_flags(flag_id),
  cycle_saludatum date not null,
  current_saludatum date not null,
  status text not null default 'NY'
    check (status in ('NY', 'HANDLÄGGS', 'VÄNTAR', 'SLUTBEDÖMNING', 'STÄNGD')),
  escalation_status text not null default 'NORMAL'
    check (escalation_status in ('NORMAL', 'T10', 'PASSERAD')),
  owner_function text not null default 'BILKONTROLL'
    check (owner_function = 'BILKONTROLL'),
  created_at timestamptz not null default now(),
  created_by uuid,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  closure_outcome text
    check (closure_outcome is null or closure_outcome in (
      'FARDIGBEHANDLAD',
      'PLAN_ANDRAD_AVBRUTEN',
      'FARDIG_MED_ACCEPTERAD_AVVIKELSE'
    )),
  closure_comment text,
  check (previous_flag_id is null or previous_flag_id <> flag_id),
  check ((status = 'STÄNGD') = (closed_at is not null)),
  check (closed_at is null or closed_by is not null),
  check (closed_at is null or closure_outcome is not null)
);

create unique index if not exists salu_flags_one_active_per_regnr_idx
  on public.salu_flags (regnr)
  where status <> 'STÄNGD';

create index if not exists salu_flags_regnr_history_idx
  on public.salu_flags (regnr, created_at desc);

create table if not exists public.salu_checkpoints (
  checkpoint_id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.salu_flags(flag_id) on delete restrict,
  checkpoint_code text not null check (checkpoint_code ~ '^S(0[0-9]|1[0-9]|2[0-8])$'),
  status text not null default 'VÄNTAR'
    check (status in ('GODKÄND', 'AVVIKELSE', 'EJ RELEVANT', 'VÄNTAR')),
  evidence_refs jsonb not null default '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (flag_id, checkpoint_code)
);

create table if not exists public.salu_inline_actions (
  inline_action_id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.salu_flags(flag_id) on delete restrict,
  source_checkpoint text check (source_checkpoint is null or source_checkpoint ~ '^S(0[0-9]|1[0-9]|2[0-8])$'),
  description text not null,
  owner_ref text not null,
  deadline_at timestamptz,
  status text not null default 'OPEN' check (status in ('OPEN', 'DONE', 'CANCELLED')),
  outcome text,
  evidence_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.salu_child_processes (
  child_process_id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.salu_flags(flag_id) on delete restrict,
  process_type text not null,
  source_checkpoint text check (source_checkpoint is null or source_checkpoint ~ '^S(0[0-9]|1[0-9]|2[0-8])$'),
  source_reason text,
  owner_ref text not null,
  execution_system text not null
    check (execution_system in ('INCHECKAD', 'PLANNER', 'EXTERNAL')),
  deadline_at timestamptz,
  due_event text,
  status text not null default 'CREATED'
    check (status in ('CREATED', 'ACCEPTED', 'IN_PROGRESS', 'READY_FOR_VERIFICATION', 'VERIFIED', 'CANCELLED')),
  status_timestamp timestamptz not null default now(),
  status_actor uuid,
  accepted_by uuid,
  accepted_at timestamptz,
  blocking boolean not null default false,
  blocks_step text,
  outcome text,
  evidence_refs jsonb not null default '[]'::jsonb,
  verified_by uuid,
  verified_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  created_by uuid,
  check (deadline_at is not null or due_event is not null),
  check (
    status not in ('ACCEPTED', 'IN_PROGRESS', 'READY_FOR_VERIFICATION', 'VERIFIED')
    or (accepted_by is not null and accepted_at is not null)
  ),
  check (status <> 'VERIFIED' or (verified_by is not null and verified_at is not null)),
  check (status <> 'CANCELLED' or cancel_reason is not null)
);

create index if not exists salu_child_processes_flag_idx
  on public.salu_child_processes (flag_id, status);

create table if not exists public.salu_events (
  event_id uuid primary key default gen_random_uuid(),
  regnr text not null,
  flag_id uuid references public.salu_flags(flag_id) on delete restrict,
  event_type text not null check (event_type in (
    'SALU_FLAG_CREATED',
    'SALU_FLAG_ACKNOWLEDGED',
    'SALU_ASSESSMENT_RECORDED',
    'SALU_CHECKPOINT_CHANGED',
    'SALU_INLINE_ACTION_CREATED',
    'SALU_CHILD_PROCESS_CREATED',
    'SALU_CHILD_STATUS_REPORTED',
    'SALU_SALUDATUM_CHANGED',
    'SALU_SOLD_RECORDED',
    'SALU_HANDOVER_RECORDED',
    'SALU_T10_ESCALATED',
    'SALU_T0_PASSED',
    'SALU_FLAG_READY_FOR_OWNER_DECISION',
    'SALU_FLAG_CLOSED_MANUALLY'
  )),
  event_key text,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_source text not null default 'SYSTEM' check (actor_source in ('SYSTEM', 'MANUELL', 'EXTERNAL')),
  payload jsonb not null default '{}'::jsonb,
  correction_of_event_id uuid references public.salu_events(event_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (event_key),
  check (correction_of_event_id is null or correction_of_event_id <> event_id)
);

create index if not exists salu_events_regnr_time_idx
  on public.salu_events (regnr, occurred_at desc);

create index if not exists salu_events_flag_time_idx
  on public.salu_events (flag_id, occurred_at desc)
  where flag_id is not null;

create or replace function public.reject_salu_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'salu_events is append-only; write a correcting event instead';
end;
$$;

drop trigger if exists salu_events_append_only_update on public.salu_events;
create trigger salu_events_append_only_update
before update on public.salu_events
for each row execute function public.reject_salu_event_mutation();

drop trigger if exists salu_events_append_only_delete on public.salu_events;
create trigger salu_events_append_only_delete
before delete on public.salu_events
for each row execute function public.reject_salu_event_mutation();

alter table public.salu_auto_rules enable row level security;
alter table public.salu_stillestand_causes enable row level security;
alter table public.salu_vehicle_state enable row level security;
alter table public.salu_flags enable row level security;
alter table public.salu_checkpoints enable row level security;
alter table public.salu_inline_actions enable row level security;
alter table public.salu_child_processes enable row level security;
alter table public.salu_events enable row level security;

revoke all on public.salu_auto_rules from public, anon, authenticated;
revoke all on public.salu_stillestand_causes from public, anon, authenticated;
revoke all on public.salu_vehicle_state from public, anon, authenticated;
revoke all on public.salu_flags from public, anon, authenticated;
revoke all on public.salu_checkpoints from public, anon, authenticated;
revoke all on public.salu_inline_actions from public, anon, authenticated;
revoke all on public.salu_child_processes from public, anon, authenticated;
revoke all on public.salu_events from public, anon, authenticated;
revoke execute on function public.reject_salu_event_mutation() from public, anon, authenticated;

grant select, insert, update, delete on public.salu_auto_rules to service_role;
grant select, insert, update, delete on public.salu_stillestand_causes to service_role;
grant select, insert, update, delete on public.salu_vehicle_state to service_role;
grant select, insert, update, delete on public.salu_flags to service_role;
grant select, insert, update, delete on public.salu_checkpoints to service_role;
grant select, insert, update, delete on public.salu_inline_actions to service_role;
grant select, insert, update, delete on public.salu_child_processes to service_role;
grant select, insert on public.salu_events to service_role;
grant execute on function public.reject_salu_event_mutation() to service_role;

commit;
