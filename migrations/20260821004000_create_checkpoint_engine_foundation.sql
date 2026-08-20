begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Generic checkpoint definitions. Definitions are versioned so historical vehicle
-- outcomes remain tied to the rule that was active when the checkpoint was created.
create table public.checkpoint_definitions (
  checkpoint_code text not null,
  definition_version integer not null check (definition_version > 0),
  domain text not null check (domain in (
    'NYBIL', 'DRIFT', 'CHECKIN', 'SERVICE', 'SALU', 'PLANERING', 'INKOP', 'OTHER'
  )),
  title text not null check (length(trim(title)) > 0),
  description text,
  owner_function text not null check (length(trim(owner_function)) > 0),
  verification_mode text not null default 'MANUELL'
    check (verification_mode in ('MANUELL', 'SYSTEM', 'EVIDENCE_REQUIRED')),
  blocking boolean not null default false,
  trigger_type text,
  trigger_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (checkpoint_code, definition_version),
  check (checkpoint_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$')
);

create unique index checkpoint_definitions_one_active_version_uidx
  on public.checkpoint_definitions (checkpoint_code)
  where active;

-- No FK on regnr for the same reason as vehicle_journey_events: Production has
-- legitimate Nybil/Check/SALU source vehicles that are not present in vehicles.
create table public.vehicle_checkpoints (
  checkpoint_id uuid primary key default gen_random_uuid(),
  regnr text not null check (length(trim(regnr)) > 0),
  checkpoint_code text not null,
  definition_version integer not null,
  cycle_key text not null default 'default' check (length(trim(cycle_key)) > 0),
  status text not null default 'VANTAR'
    check (status in ('VANTAR', 'GODKAND', 'AVVIKELSE', 'EJ_RELEVANT')),
  due_at timestamptz,
  source_journey_event_id uuid references public.vehicle_journey_events(event_id) on delete restrict,
  source_context jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  foreign key (checkpoint_code, definition_version)
    references public.checkpoint_definitions(checkpoint_code, definition_version) on delete restrict,
  unique (regnr, checkpoint_code, cycle_key)
);

create index vehicle_checkpoints_regnr_status_idx
  on public.vehicle_checkpoints (regnr, status, due_at);
create index vehicle_checkpoints_definition_idx
  on public.vehicle_checkpoints (checkpoint_code, definition_version);
create index vehicle_checkpoints_source_event_idx
  on public.vehicle_checkpoints (source_journey_event_id)
  where source_journey_event_id is not null;

-- Assessments are the immutable outcome ledger for a checkpoint. The mutable
-- vehicle_checkpoints.status row is only the current projection.
create table public.checkpoint_assessments (
  assessment_id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references public.vehicle_checkpoints(checkpoint_id) on delete restrict,
  previous_status text not null
    check (previous_status in ('VANTAR', 'GODKAND', 'AVVIKELSE', 'EJ_RELEVANT')),
  status text not null
    check (status in ('GODKAND', 'AVVIKELSE', 'EJ_RELEVANT')),
  comment text,
  evidence_refs jsonb not null default '[]'::jsonb,
  actor_id uuid,
  actor_email text,
  actor_source text not null default 'MANUELL'
    check (actor_source in ('SYSTEM', 'MANUELL', 'EXTERNAL')),
  assessed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (status <> 'AVVIKELSE' or length(trim(coalesce(comment, ''))) > 0),
  check (jsonb_typeof(evidence_refs) = 'array')
);

create index checkpoint_assessments_checkpoint_time_idx
  on public.checkpoint_assessments (checkpoint_id, assessed_at desc);

create or replace function public.reject_checkpoint_assessment_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'checkpoint_assessments is append-only; write a new assessment instead';
end;
$$;

create trigger checkpoint_assessments_append_only_update
before update on public.checkpoint_assessments
for each row execute function public.reject_checkpoint_assessment_mutation();

create trigger checkpoint_assessments_append_only_delete
before delete on public.checkpoint_assessments
for each row execute function public.reject_checkpoint_assessment_mutation();

-- Atomic assessment: lock current checkpoint, validate evidence semantics,
-- append immutable assessment, update projection and append journey event.
create or replace function public.assess_vehicle_checkpoint(
  p_checkpoint_id uuid,
  p_status text,
  p_comment text,
  p_evidence_refs jsonb,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_source text default 'MANUELL'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_checkpoint public.vehicle_checkpoints%rowtype;
  v_definition public.checkpoint_definitions%rowtype;
  v_assessment_id uuid;
begin
  if p_status not in ('GODKAND', 'AVVIKELSE', 'EJ_RELEVANT') then
    raise exception 'Invalid checkpoint status' using errcode = '22023';
  end if;

  if p_status = 'AVVIKELSE' and length(trim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Deviation requires a comment' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_evidence_refs, '[]'::jsonb)) <> 'array' then
    raise exception 'Evidence refs must be an array' using errcode = '22023';
  end if;

  select * into v_checkpoint
  from public.vehicle_checkpoints
  where checkpoint_id = p_checkpoint_id
  for update;

  if not found then
    raise exception 'Checkpoint not found' using errcode = 'P0002';
  end if;

  select * into v_definition
  from public.checkpoint_definitions
  where checkpoint_code = v_checkpoint.checkpoint_code
    and definition_version = v_checkpoint.definition_version;

  if v_definition.verification_mode = 'EVIDENCE_REQUIRED'
     and p_status = 'GODKAND'
     and pg_catalog.jsonb_array_length(coalesce(p_evidence_refs, '[]'::jsonb)) = 0 then
    raise exception 'Approved checkpoint requires evidence' using errcode = '22023';
  end if;

  insert into public.checkpoint_assessments (
    checkpoint_id,
    previous_status,
    status,
    comment,
    evidence_refs,
    actor_id,
    actor_email,
    actor_source
  ) values (
    p_checkpoint_id,
    v_checkpoint.status,
    p_status,
    nullif(trim(coalesce(p_comment, '')), ''),
    coalesce(p_evidence_refs, '[]'::jsonb),
    p_actor_id,
    p_actor_email,
    p_actor_source
  ) returning assessment_id into v_assessment_id;

  update public.vehicle_checkpoints
  set status = p_status,
      updated_by = p_actor_id,
      updated_at = pg_catalog.now()
  where checkpoint_id = p_checkpoint_id;

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
    v_checkpoint.regnr,
    'CHECKPOINT_ASSESSED',
    'checkpoint-assessment:' || v_assessment_id::text,
    pg_catalog.now(),
    'CHECKPOINT_ENGINE',
    'checkpoint_assessments',
    v_assessment_id::text,
    p_actor_id,
    p_actor_source,
    p_actor_email,
    pg_catalog.jsonb_build_object(
      'checkpointId', p_checkpoint_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'definitionVersion', v_checkpoint.definition_version,
      'previousStatus', v_checkpoint.status,
      'status', p_status,
      'comment', nullif(trim(coalesce(p_comment, '')), ''),
      'evidenceRefs', coalesce(p_evidence_refs, '[]'::jsonb),
      'blocking', v_definition.blocking
    )
  );

  return pg_catalog.jsonb_build_object(
    'assessment_id', v_assessment_id,
    'checkpoint_id', p_checkpoint_id,
    'previous_status', v_checkpoint.status,
    'status', p_status
  );
end;
$$;

alter table public.checkpoint_definitions enable row level security;
alter table public.vehicle_checkpoints enable row level security;
alter table public.checkpoint_assessments enable row level security;

revoke all on public.checkpoint_definitions from public, anon, authenticated;
revoke all on public.vehicle_checkpoints from public, anon, authenticated;
revoke all on public.checkpoint_assessments from public, anon, authenticated;
revoke all on function public.reject_checkpoint_assessment_mutation() from public, anon, authenticated;
revoke all on function public.assess_vehicle_checkpoint(uuid, text, text, jsonb, uuid, text, text)
  from public, anon, authenticated;

grant select, insert, update, delete on public.checkpoint_definitions to service_role;
grant select, insert, update on public.vehicle_checkpoints to service_role;
grant select, insert on public.checkpoint_assessments to service_role;
grant execute on function public.reject_checkpoint_assessment_mutation() to service_role;
grant execute on function public.assess_vehicle_checkpoint(uuid, text, text, jsonb, uuid, text, text)
  to service_role;

commit;
