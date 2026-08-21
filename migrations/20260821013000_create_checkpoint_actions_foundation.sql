begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Generic remediation layer above checkpoint assessments. SALU keeps its own
-- inline actions and child processes; this table serves non-SALU and shared
-- checkpoint workflows without duplicating those domain contracts.
create table public.checkpoint_actions (
  action_id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references public.vehicle_checkpoints(checkpoint_id) on delete restrict,
  source_assessment_id uuid not null references public.checkpoint_assessments(assessment_id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  owner_function text not null check (length(trim(owner_function)) between 1 and 120),
  owner_ref text,
  deadline_at timestamptz not null,
  blocking boolean not null default true,
  status text not null default 'CREATED'
    check (status in (
      'CREATED',
      'ACCEPTED',
      'IN_PROGRESS',
      'READY_FOR_VERIFICATION',
      'VERIFIED',
      'CANCELLED'
    )),
  outcome text
    check (outcome is null or outcome in (
      'ATGARDAD',
      'ACCEPTERAD_AVVIKELSE',
      'EJ_RELEVANT',
      'FORTSATT_AVVIKELSE'
    )),
  outcome_comment text,
  verification_assessment_id uuid references public.checkpoint_assessments(assessment_id) on delete restrict,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  accepted_by uuid,
  accepted_at timestamptz,
  ready_for_verification_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  updated_by uuid,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  check ((accepted_by is null) = (accepted_at is null)),
  check ((verified_by is null) = (verified_at is null)),
  check ((cancelled_by is null) = (cancelled_at is null)),
  check (
    status not in ('ACCEPTED', 'IN_PROGRESS', 'READY_FOR_VERIFICATION', 'VERIFIED')
    or (accepted_by is not null and accepted_at is not null)
  ),
  check (
    status <> 'READY_FOR_VERIFICATION'
    or ready_for_verification_at is not null
  ),
  check (
    status <> 'VERIFIED'
    or (
      outcome is not null
      and verification_assessment_id is not null
      and verified_by is not null
      and verified_at is not null
    )
  ),
  check (
    status <> 'CANCELLED'
    or (
      cancelled_by is not null
      and cancelled_at is not null
      and length(trim(coalesce(cancel_reason, ''))) > 0
    )
  ),
  check (status = 'VERIFIED' or outcome is null),
  check (status = 'VERIFIED' or verification_assessment_id is null),
  check (status = 'CANCELLED' or cancel_reason is null)
);

create index checkpoint_actions_checkpoint_status_idx
  on public.checkpoint_actions (checkpoint_id, status, deadline_at);
create index checkpoint_actions_open_deadline_idx
  on public.checkpoint_actions (deadline_at, checkpoint_id)
  where status not in ('VERIFIED', 'CANCELLED');
create index checkpoint_actions_source_assessment_idx
  on public.checkpoint_actions (source_assessment_id);
create index checkpoint_actions_verification_assessment_idx
  on public.checkpoint_actions (verification_assessment_id)
  where verification_assessment_id is not null;

-- Immutable workflow history. The current checkpoint_actions row is only the
-- operational projection used by the UI.
create table public.checkpoint_action_events (
  action_event_id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.checkpoint_actions(action_id) on delete restrict,
  checkpoint_id uuid not null references public.vehicle_checkpoints(checkpoint_id) on delete restrict,
  event_type text not null
    check (event_type in (
      'ACTION_CREATED',
      'ACTION_STATUS_CHANGED',
      'ACTION_VERIFIED',
      'ACTION_CANCELLED'
    )),
  previous_status text
    check (previous_status is null or previous_status in (
      'CREATED',
      'ACCEPTED',
      'IN_PROGRESS',
      'READY_FOR_VERIFICATION',
      'VERIFIED',
      'CANCELLED'
    )),
  status text not null
    check (status in (
      'CREATED',
      'ACCEPTED',
      'IN_PROGRESS',
      'READY_FOR_VERIFICATION',
      'VERIFIED',
      'CANCELLED'
    )),
  comment text,
  actor_id uuid,
  actor_email text,
  actor_source text not null default 'MANUELL'
    check (actor_source in ('SYSTEM', 'MANUELL', 'EXTERNAL')),
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(payload) = 'object')
);

create index checkpoint_action_events_action_time_idx
  on public.checkpoint_action_events (action_id, occurred_at desc);
create index checkpoint_action_events_checkpoint_time_idx
  on public.checkpoint_action_events (checkpoint_id, occurred_at desc);

create or replace function public.reject_checkpoint_action_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'checkpoint_action_events is append-only; write a new event instead';
end;
$$;

create trigger checkpoint_action_events_append_only_update
before update on public.checkpoint_action_events
for each row execute function public.reject_checkpoint_action_event_mutation();

create trigger checkpoint_action_events_append_only_delete
before delete on public.checkpoint_action_events
for each row execute function public.reject_checkpoint_action_event_mutation();

create or replace function public.create_checkpoint_action(
  p_checkpoint_id uuid,
  p_title text,
  p_description text,
  p_owner_function text,
  p_owner_ref text,
  p_deadline_at timestamptz,
  p_blocking boolean,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_checkpoint public.vehicle_checkpoints%rowtype;
  v_assessment public.checkpoint_assessments%rowtype;
  v_action public.checkpoint_actions%rowtype;
begin
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Action title is required' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_owner_function, ''))) = 0 then
    raise exception 'Action owner function is required' using errcode = '22023';
  end if;

  if p_deadline_at is null then
    raise exception 'Action deadline is required' using errcode = '22023';
  end if;

  select * into v_checkpoint
  from public.vehicle_checkpoints
  where checkpoint_id = p_checkpoint_id
  for update;

  if not found then
    raise exception 'Checkpoint not found' using errcode = 'P0002';
  end if;

  if v_checkpoint.status <> 'AVVIKELSE' then
    raise exception 'Actions can only be created for a checkpoint deviation' using errcode = 'P0001';
  end if;

  select * into v_assessment
  from public.checkpoint_assessments
  where checkpoint_id = p_checkpoint_id
    and status = 'AVVIKELSE'
  order by assessed_at desc, assessment_id desc
  limit 1;

  if not found then
    raise exception 'Deviation assessment not found' using errcode = 'P0002';
  end if;

  insert into public.checkpoint_actions (
    checkpoint_id,
    source_assessment_id,
    title,
    description,
    owner_function,
    owner_ref,
    deadline_at,
    blocking,
    created_by,
    created_by_email,
    updated_by,
    updated_by_email
  ) values (
    p_checkpoint_id,
    v_assessment.assessment_id,
    trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    trim(p_owner_function),
    nullif(trim(coalesce(p_owner_ref, '')), ''),
    p_deadline_at,
    coalesce(p_blocking, true),
    p_actor_id,
    p_actor_email,
    p_actor_id,
    p_actor_email
  )
  returning * into v_action;

  insert into public.checkpoint_action_events (
    action_id,
    checkpoint_id,
    event_type,
    previous_status,
    status,
    actor_id,
    actor_email,
    actor_source,
    payload
  ) values (
    v_action.action_id,
    p_checkpoint_id,
    'ACTION_CREATED',
    null,
    'CREATED',
    p_actor_id,
    p_actor_email,
    'MANUELL',
    pg_catalog.jsonb_build_object(
      'title', v_action.title,
      'ownerFunction', v_action.owner_function,
      'ownerRef', v_action.owner_ref,
      'deadlineAt', v_action.deadline_at,
      'blocking', v_action.blocking,
      'sourceAssessmentId', v_action.source_assessment_id
    )
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
    v_checkpoint.regnr,
    'CHECKPOINT_ACTION_CREATED',
    'checkpoint-action-created:' || v_action.action_id::text,
    pg_catalog.now(),
    'CHECKPOINT_ENGINE',
    'checkpoint_actions',
    v_action.action_id::text,
    p_actor_id,
    'MANUELL',
    p_actor_email,
    pg_catalog.jsonb_build_object(
      'actionId', v_action.action_id,
      'checkpointId', p_checkpoint_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'status', v_action.status,
      'title', v_action.title,
      'ownerFunction', v_action.owner_function,
      'ownerRef', v_action.owner_ref,
      'deadlineAt', v_action.deadline_at,
      'blocking', v_action.blocking
    )
  );

  return to_jsonb(v_action);
end;
$$;

create or replace function public.transition_checkpoint_action(
  p_action_id uuid,
  p_next_status text,
  p_comment text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_action public.checkpoint_actions%rowtype;
  v_checkpoint public.vehicle_checkpoints%rowtype;
  v_allowed boolean := false;
  v_event_type text := 'ACTION_STATUS_CHANGED';
begin
  select * into v_action
  from public.checkpoint_actions
  where action_id = p_action_id
  for update;

  if not found then
    raise exception 'Checkpoint action not found' using errcode = 'P0002';
  end if;

  select * into v_checkpoint
  from public.vehicle_checkpoints
  where checkpoint_id = v_action.checkpoint_id;

  if v_action.status in ('VERIFIED', 'CANCELLED') then
    raise exception 'Terminal checkpoint action cannot transition' using errcode = 'P0001';
  end if;

  v_allowed := case
    when v_action.status = 'CREATED' and p_next_status in ('ACCEPTED', 'CANCELLED') then true
    when v_action.status = 'ACCEPTED' and p_next_status in ('IN_PROGRESS', 'CANCELLED') then true
    when v_action.status = 'IN_PROGRESS' and p_next_status in ('READY_FOR_VERIFICATION', 'CANCELLED') then true
    when v_action.status = 'READY_FOR_VERIFICATION' and p_next_status in ('IN_PROGRESS', 'CANCELLED') then true
    else false
  end;

  if not v_allowed then
    raise exception 'Invalid checkpoint action transition % -> %', v_action.status, p_next_status
      using errcode = '22023';
  end if;

  if p_next_status = 'CANCELLED' and length(trim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Cancellation requires a reason' using errcode = '22023';
  end if;

  if p_next_status = 'CANCELLED' then
    v_event_type := 'ACTION_CANCELLED';
  end if;

  update public.checkpoint_actions
  set status = p_next_status,
      accepted_by = case when p_next_status = 'ACCEPTED' then p_actor_id else accepted_by end,
      accepted_at = case when p_next_status = 'ACCEPTED' then pg_catalog.now() else accepted_at end,
      ready_for_verification_at = case
        when p_next_status = 'READY_FOR_VERIFICATION' then pg_catalog.now()
        when p_next_status = 'IN_PROGRESS' then null
        else ready_for_verification_at
      end,
      cancelled_by = case when p_next_status = 'CANCELLED' then p_actor_id else cancelled_by end,
      cancelled_at = case when p_next_status = 'CANCELLED' then pg_catalog.now() else cancelled_at end,
      cancel_reason = case
        when p_next_status = 'CANCELLED' then trim(p_comment)
        else cancel_reason
      end,
      updated_by = p_actor_id,
      updated_by_email = p_actor_email,
      updated_at = pg_catalog.now()
  where action_id = p_action_id
  returning * into v_action;

  insert into public.checkpoint_action_events (
    action_id,
    checkpoint_id,
    event_type,
    previous_status,
    status,
    comment,
    actor_id,
    actor_email,
    actor_source,
    payload
  ) values (
    p_action_id,
    v_action.checkpoint_id,
    v_event_type,
    case
      when p_next_status = 'ACCEPTED' then 'CREATED'
      when p_next_status = 'IN_PROGRESS' and v_action.ready_for_verification_at is null then 'ACCEPTED'
      when p_next_status = 'IN_PROGRESS' then 'READY_FOR_VERIFICATION'
      when p_next_status = 'READY_FOR_VERIFICATION' then 'IN_PROGRESS'
      when p_next_status = 'CANCELLED' then null
      else null
    end,
    p_next_status,
    nullif(trim(coalesce(p_comment, '')), ''),
    p_actor_id,
    p_actor_email,
    'MANUELL',
    pg_catalog.jsonb_build_object(
      'ownerFunction', v_action.owner_function,
      'ownerRef', v_action.owner_ref,
      'deadlineAt', v_action.deadline_at,
      'blocking', v_action.blocking
    )
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
    v_checkpoint.regnr,
    case
      when p_next_status = 'CANCELLED' then 'CHECKPOINT_ACTION_CANCELLED'
      else 'CHECKPOINT_ACTION_STATUS_CHANGED'
    end,
    'checkpoint-action:' || p_action_id::text || ':' || p_next_status || ':' || extract(epoch from pg_catalog.clock_timestamp())::text,
    pg_catalog.now(),
    'CHECKPOINT_ENGINE',
    'checkpoint_actions',
    p_action_id::text,
    p_actor_id,
    'MANUELL',
    p_actor_email,
    pg_catalog.jsonb_build_object(
      'actionId', p_action_id,
      'checkpointId', v_action.checkpoint_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'status', p_next_status,
      'comment', nullif(trim(coalesce(p_comment, '')), ''),
      'blocking', v_action.blocking,
      'deadlineAt', v_action.deadline_at
    )
  );

  return to_jsonb(v_action);
end;
$$;

create or replace function public.verify_checkpoint_action(
  p_action_id uuid,
  p_outcome text,
  p_comment text,
  p_evidence_refs jsonb,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_action public.checkpoint_actions%rowtype;
  v_checkpoint public.vehicle_checkpoints%rowtype;
  v_checkpoint_status text;
  v_assessment_result jsonb;
  v_assessment_id uuid;
begin
  if p_outcome not in ('ATGARDAD', 'ACCEPTERAD_AVVIKELSE', 'EJ_RELEVANT', 'FORTSATT_AVVIKELSE') then
    raise exception 'Invalid checkpoint action outcome' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_evidence_refs, '[]'::jsonb)) <> 'array' then
    raise exception 'Evidence refs must be an array' using errcode = '22023';
  end if;

  if p_outcome in ('ACCEPTERAD_AVVIKELSE', 'FORTSATT_AVVIKELSE')
     and length(trim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Selected outcome requires a comment' using errcode = '22023';
  end if;

  select * into v_action
  from public.checkpoint_actions
  where action_id = p_action_id
  for update;

  if not found then
    raise exception 'Checkpoint action not found' using errcode = 'P0002';
  end if;

  if v_action.status <> 'READY_FOR_VERIFICATION' then
    raise exception 'Checkpoint action is not ready for verification' using errcode = 'P0001';
  end if;

  select * into v_checkpoint
  from public.vehicle_checkpoints
  where checkpoint_id = v_action.checkpoint_id
  for update;

  v_checkpoint_status := case
    when p_outcome in ('ATGARDAD', 'ACCEPTERAD_AVVIKELSE') then 'GODKAND'
    when p_outcome = 'EJ_RELEVANT' then 'EJ_RELEVANT'
    else 'AVVIKELSE'
  end;

  v_assessment_result := public.assess_vehicle_checkpoint(
    v_action.checkpoint_id,
    v_checkpoint_status,
    nullif(trim(coalesce(p_comment, '')), ''),
    coalesce(p_evidence_refs, '[]'::jsonb),
    p_actor_id,
    p_actor_email,
    'MANUELL'
  );

  v_assessment_id := (v_assessment_result ->> 'assessment_id')::uuid;

  update public.checkpoint_actions
  set status = 'VERIFIED',
      outcome = p_outcome,
      outcome_comment = nullif(trim(coalesce(p_comment, '')), ''),
      verification_assessment_id = v_assessment_id,
      verified_by = p_actor_id,
      verified_at = pg_catalog.now(),
      updated_by = p_actor_id,
      updated_by_email = p_actor_email,
      updated_at = pg_catalog.now()
  where action_id = p_action_id
  returning * into v_action;

  insert into public.checkpoint_action_events (
    action_id,
    checkpoint_id,
    event_type,
    previous_status,
    status,
    comment,
    actor_id,
    actor_email,
    actor_source,
    payload
  ) values (
    p_action_id,
    v_action.checkpoint_id,
    'ACTION_VERIFIED',
    'READY_FOR_VERIFICATION',
    'VERIFIED',
    v_action.outcome_comment,
    p_actor_id,
    p_actor_email,
    'MANUELL',
    pg_catalog.jsonb_build_object(
      'outcome', p_outcome,
      'checkpointStatus', v_checkpoint_status,
      'verificationAssessmentId', v_assessment_id,
      'evidenceRefs', coalesce(p_evidence_refs, '[]'::jsonb)
    )
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
    v_checkpoint.regnr,
    'CHECKPOINT_ACTION_VERIFIED',
    'checkpoint-action-verified:' || p_action_id::text,
    pg_catalog.now(),
    'CHECKPOINT_ENGINE',
    'checkpoint_actions',
    p_action_id::text,
    p_actor_id,
    'MANUELL',
    p_actor_email,
    pg_catalog.jsonb_build_object(
      'actionId', p_action_id,
      'checkpointId', v_action.checkpoint_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'outcome', p_outcome,
      'checkpointStatus', v_checkpoint_status,
      'verificationAssessmentId', v_assessment_id,
      'evidenceRefs', coalesce(p_evidence_refs, '[]'::jsonb)
    )
  );

  return to_jsonb(v_action);
end;
$$;

alter table public.checkpoint_actions enable row level security;
alter table public.checkpoint_action_events enable row level security;

revoke all on public.checkpoint_actions from public, anon, authenticated;
revoke all on public.checkpoint_action_events from public, anon, authenticated;
revoke all on function public.reject_checkpoint_action_event_mutation()
  from public, anon, authenticated;
revoke all on function public.create_checkpoint_action(uuid, text, text, text, text, timestamptz, boolean, uuid, text)
  from public, anon, authenticated;
revoke all on function public.transition_checkpoint_action(uuid, text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.verify_checkpoint_action(uuid, text, text, jsonb, uuid, text)
  from public, anon, authenticated;

grant select, insert, update on public.checkpoint_actions to service_role;
grant select, insert on public.checkpoint_action_events to service_role;
grant execute on function public.reject_checkpoint_action_event_mutation()
  to service_role;
grant execute on function public.create_checkpoint_action(uuid, text, text, text, text, timestamptz, boolean, uuid, text)
  to service_role;
grant execute on function public.transition_checkpoint_action(uuid, text, text, uuid, text)
  to service_role;
grant execute on function public.verify_checkpoint_action(uuid, text, text, jsonb, uuid, text)
  to service_role;

commit;
