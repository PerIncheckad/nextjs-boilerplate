begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Layer 2.2: HANDSLAGET.
-- A handoff is a verified transition contract between two responsible functions.
-- Source events may request a handoff, but a request is not the same as receipt,
-- acceptance, execution or verification.
create table public.handoff_definitions (
  handoff_code text not null,
  handoff_version integer not null check (handoff_version > 0),
  routine_code text not null,
  routine_version integer not null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  from_function text not null check (length(trim(from_function)) between 1 and 120),
  to_function text not null check (length(trim(to_function)) between 1 and 120),
  verification_mode text not null default 'MANUELL'
    check (verification_mode in ('MANUELL', 'SYSTEM', 'EVIDENCE_REQUIRED')),
  blocking boolean not null default true,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (handoff_code, handoff_version),
  foreign key (routine_code, routine_version)
    references public.routine_definitions(routine_code, routine_version)
    on delete restrict,
  check (handoff_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$'),
  check (from_function <> to_function)
);

create unique index handoff_definitions_one_active_version_uidx
  on public.handoff_definitions (handoff_code)
  where active;

create table public.handoffs (
  handoff_id uuid primary key default gen_random_uuid(),
  handoff_code text not null,
  handoff_version integer not null,
  regnr text not null check (length(trim(regnr)) > 0),
  source_system text not null check (length(trim(source_system)) between 1 and 120),
  source_entity text,
  source_record_id text not null check (length(trim(source_record_id)) between 1 and 200),
  source_event_key text,
  status text not null default 'REQUESTED'
    check (status in (
      'REQUESTED',
      'HANDED_OVER',
      'RECEIVED',
      'ACCEPTED',
      'COMPLETED',
      'VERIFIED',
      'CANCELLED'
    )),
  handed_over_by uuid,
  handed_over_by_email text,
  handed_over_at timestamptz,
  received_by uuid,
  received_by_email text,
  received_at timestamptz,
  accepted_by uuid,
  accepted_by_email text,
  accepted_at timestamptz,
  completed_by uuid,
  completed_by_email text,
  completed_at timestamptz,
  verified_by uuid,
  verified_by_email text,
  verified_at timestamptz,
  cancelled_by uuid,
  cancelled_by_email text,
  cancelled_at timestamptz,
  cancel_reason text,
  evidence_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (handoff_code, handoff_version)
    references public.handoff_definitions(handoff_code, handoff_version)
    on delete restrict,
  unique (handoff_code, handoff_version, source_system, source_record_id),
  check (jsonb_typeof(evidence_refs) = 'array'),
  check (jsonb_typeof(metadata) = 'object'),
  check ((handed_over_by is null) = (handed_over_at is null)),
  check ((received_by is null) = (received_at is null)),
  check ((accepted_by is null) = (accepted_at is null)),
  check ((completed_by is null) = (completed_at is null)),
  check ((verified_by is null) = (verified_at is null)),
  check ((cancelled_by is null) = (cancelled_at is null)),
  check (status <> 'CANCELLED' or length(trim(coalesce(cancel_reason, ''))) > 0)
);

create index handoffs_regnr_status_idx
  on public.handoffs (regnr, status, created_at desc);
create index handoffs_definition_idx
  on public.handoffs (handoff_code, handoff_version, status);

create table public.handoff_events (
  handoff_event_id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.handoffs(handoff_id) on delete restrict,
  event_type text not null
    check (event_type in (
      'HANDOFF_REQUESTED',
      'HANDOFF_HANDED_OVER',
      'HANDOFF_RECEIVED',
      'HANDOFF_ACCEPTED',
      'HANDOFF_COMPLETED',
      'HANDOFF_VERIFIED',
      'HANDOFF_CANCELLED'
    )),
  previous_status text,
  status text not null,
  actor_id uuid,
  actor_email text,
  actor_source text not null default 'MANUELL'
    check (actor_source in ('SYSTEM', 'MANUELL', 'EXTERNAL')),
  comment text,
  evidence_refs jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(evidence_refs) = 'array'),
  check (jsonb_typeof(payload) = 'object')
);

create index handoff_events_handoff_time_idx
  on public.handoff_events (handoff_id, occurred_at desc);

create or replace function public.reject_handoff_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'handoff_events is append-only; write a new event instead';
end;
$$;

create trigger handoff_events_append_only_update
before update on public.handoff_events
for each row execute function public.reject_handoff_event_mutation();

create trigger handoff_events_append_only_delete
before delete on public.handoff_events
for each row execute function public.reject_handoff_event_mutation();

create or replace function public.ensure_handoff_from_source(
  p_handoff_code text,
  p_regnr text,
  p_source_system text,
  p_source_entity text,
  p_source_record_id text,
  p_source_event_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_definition public.handoff_definitions%rowtype;
  v_handoff public.handoffs%rowtype;
begin
  select * into v_definition
  from public.handoff_definitions
  where handoff_code = upper(trim(p_handoff_code))
    and active
  order by handoff_version desc
  limit 1;

  if not found then
    raise exception 'Active handoff definition not found' using errcode = 'P0002';
  end if;

  insert into public.handoffs (
    handoff_code,
    handoff_version,
    regnr,
    source_system,
    source_entity,
    source_record_id,
    source_event_key,
    metadata
  ) values (
    v_definition.handoff_code,
    v_definition.handoff_version,
    upper(trim(p_regnr)),
    trim(p_source_system),
    nullif(trim(coalesce(p_source_entity, '')), ''),
    trim(p_source_record_id),
    nullif(trim(coalesce(p_source_event_key, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (handoff_code, handoff_version, source_system, source_record_id)
  do update set source_event_key = coalesce(excluded.source_event_key, public.handoffs.source_event_key)
  returning * into v_handoff;

  if not exists (
    select 1 from public.handoff_events
    where handoff_id = v_handoff.handoff_id
      and event_type = 'HANDOFF_REQUESTED'
  ) then
    insert into public.handoff_events (
      handoff_id,
      event_type,
      previous_status,
      status,
      actor_source,
      payload
    ) values (
      v_handoff.handoff_id,
      'HANDOFF_REQUESTED',
      null,
      'REQUESTED',
      'SYSTEM',
      pg_catalog.jsonb_build_object(
        'sourceSystem', v_handoff.source_system,
        'sourceEntity', v_handoff.source_entity,
        'sourceRecordId', v_handoff.source_record_id,
        'sourceEventKey', v_handoff.source_event_key
      )
    );
  end if;

  return to_jsonb(v_handoff);
end;
$$;

create or replace function public.transition_handoff(
  p_handoff_id uuid,
  p_next_status text,
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
  v_handoff public.handoffs%rowtype;
  v_definition public.handoff_definitions%rowtype;
  v_previous_status text;
  v_event_type text;
begin
  if p_next_status not in ('HANDED_OVER','RECEIVED','ACCEPTED','COMPLETED','VERIFIED','CANCELLED') then
    raise exception 'Invalid handoff transition status' using errcode = '22023';
  end if;
  if p_actor_source not in ('SYSTEM','MANUELL','EXTERNAL') then
    raise exception 'Invalid actor source' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_evidence_refs, '[]'::jsonb)) <> 'array' then
    raise exception 'Evidence refs must be an array' using errcode = '22023';
  end if;
  if p_next_status = 'CANCELLED' and length(trim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Cancellation requires a reason' using errcode = '22023';
  end if;

  select * into v_handoff
  from public.handoffs
  where handoff_id = p_handoff_id
  for update;

  if not found then
    raise exception 'Handoff not found' using errcode = 'P0002';
  end if;

  if v_handoff.status in ('VERIFIED','CANCELLED') then
    raise exception 'Terminal handoff cannot transition' using errcode = 'P0001';
  end if;

  v_previous_status := v_handoff.status;

  if not (
    (v_previous_status = 'REQUESTED' and p_next_status in ('HANDED_OVER','CANCELLED')) or
    (v_previous_status = 'HANDED_OVER' and p_next_status in ('RECEIVED','CANCELLED')) or
    (v_previous_status = 'RECEIVED' and p_next_status in ('ACCEPTED','CANCELLED')) or
    (v_previous_status = 'ACCEPTED' and p_next_status in ('COMPLETED','CANCELLED')) or
    (v_previous_status = 'COMPLETED' and p_next_status in ('VERIFIED','CANCELLED'))
  ) then
    raise exception 'Invalid handoff transition % -> %', v_previous_status, p_next_status
      using errcode = 'P0001';
  end if;

  select * into v_definition
  from public.handoff_definitions
  where handoff_code = v_handoff.handoff_code
    and handoff_version = v_handoff.handoff_version;

  if p_next_status = 'VERIFIED'
     and v_definition.verification_mode = 'EVIDENCE_REQUIRED'
     and pg_catalog.jsonb_array_length(coalesce(p_evidence_refs, '[]'::jsonb)) = 0 then
    raise exception 'Verified handoff requires evidence' using errcode = '22023';
  end if;

  update public.handoffs
  set status = p_next_status,
      handed_over_by = case when p_next_status = 'HANDED_OVER' then p_actor_id else handed_over_by end,
      handed_over_by_email = case when p_next_status = 'HANDED_OVER' then p_actor_email else handed_over_by_email end,
      handed_over_at = case when p_next_status = 'HANDED_OVER' then pg_catalog.now() else handed_over_at end,
      received_by = case when p_next_status = 'RECEIVED' then p_actor_id else received_by end,
      received_by_email = case when p_next_status = 'RECEIVED' then p_actor_email else received_by_email end,
      received_at = case when p_next_status = 'RECEIVED' then pg_catalog.now() else received_at end,
      accepted_by = case when p_next_status = 'ACCEPTED' then p_actor_id else accepted_by end,
      accepted_by_email = case when p_next_status = 'ACCEPTED' then p_actor_email else accepted_by_email end,
      accepted_at = case when p_next_status = 'ACCEPTED' then pg_catalog.now() else accepted_at end,
      completed_by = case when p_next_status = 'COMPLETED' then p_actor_id else completed_by end,
      completed_by_email = case when p_next_status = 'COMPLETED' then p_actor_email else completed_by_email end,
      completed_at = case when p_next_status = 'COMPLETED' then pg_catalog.now() else completed_at end,
      verified_by = case when p_next_status = 'VERIFIED' then p_actor_id else verified_by end,
      verified_by_email = case when p_next_status = 'VERIFIED' then p_actor_email else verified_by_email end,
      verified_at = case when p_next_status = 'VERIFIED' then pg_catalog.now() else verified_at end,
      cancelled_by = case when p_next_status = 'CANCELLED' then p_actor_id else cancelled_by end,
      cancelled_by_email = case when p_next_status = 'CANCELLED' then p_actor_email else cancelled_by_email end,
      cancelled_at = case when p_next_status = 'CANCELLED' then pg_catalog.now() else cancelled_at end,
      cancel_reason = case when p_next_status = 'CANCELLED' then trim(p_comment) else cancel_reason end,
      evidence_refs = case when p_next_status = 'VERIFIED' then coalesce(p_evidence_refs, '[]'::jsonb) else evidence_refs end,
      updated_at = pg_catalog.now()
  where handoff_id = p_handoff_id
  returning * into v_handoff;

  v_event_type := case p_next_status
    when 'HANDED_OVER' then 'HANDOFF_HANDED_OVER'
    when 'RECEIVED' then 'HANDOFF_RECEIVED'
    when 'ACCEPTED' then 'HANDOFF_ACCEPTED'
    when 'COMPLETED' then 'HANDOFF_COMPLETED'
    when 'VERIFIED' then 'HANDOFF_VERIFIED'
    when 'CANCELLED' then 'HANDOFF_CANCELLED'
  end;

  insert into public.handoff_events (
    handoff_id,
    event_type,
    previous_status,
    status,
    actor_id,
    actor_email,
    actor_source,
    comment,
    evidence_refs
  ) values (
    p_handoff_id,
    v_event_type,
    v_previous_status,
    p_next_status,
    p_actor_id,
    p_actor_email,
    p_actor_source,
    nullif(trim(coalesce(p_comment, '')), ''),
    coalesce(p_evidence_refs, '[]'::jsonb)
  );

  return to_jsonb(v_handoff);
end;
$$;

-- First vertical case: existing SALU T-30 handoff signals.
insert into public.handoff_definitions (
  handoff_code, handoff_version, routine_code, routine_version, title, description,
  from_function, to_function, verification_mode, blocking, active
) values
  (
    'SALU_TO_PLANERING', 1, 'SALU_CYCLE', 1,
    'SALU till Planering',
    'Verifierbar överlämning från SALU/Bilkontroll till Planering.',
    'BILKONTROLL', 'PLANERING', 'MANUELL', true, true
  ),
  (
    'SALU_TO_INKOP', 1, 'SALU_CYCLE', 1,
    'SALU till Inköp',
    'Verifierbar överlämning från SALU/Bilkontroll till Inköp.',
    'BILKONTROLL', 'INKÖP', 'MANUELL', true, true
  )
on conflict (handoff_code, handoff_version) do nothing;

-- Bridge only future SALU handoff request events. No historical backfill.
create or replace function public.materialize_salu_handoff_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_code text;
begin
  if new.event_type = 'SALU_PLANERING_HANDOFF_REQUESTED' then
    v_code := 'SALU_TO_PLANERING';
  elsif new.event_type = 'SALU_INKOP_HANDOFF_REQUESTED' then
    v_code := 'SALU_TO_INKOP';
  else
    return new;
  end if;

  perform public.ensure_handoff_from_source(
    v_code,
    new.regnr,
    'SALU',
    'salu_events',
    new.event_id::text,
    new.event_key,
    pg_catalog.jsonb_build_object(
      'flagId', new.flag_id,
      'sourceEventType', new.event_type,
      'sourcePayload', new.payload
    )
  );

  return new;
end;
$$;

create trigger salu_events_materialize_handoff_request
after insert on public.salu_events
for each row
when (new.event_type in ('SALU_PLANERING_HANDOFF_REQUESTED','SALU_INKOP_HANDOFF_REQUESTED'))
execute function public.materialize_salu_handoff_request();

alter table public.handoff_definitions enable row level security;
alter table public.handoffs enable row level security;
alter table public.handoff_events enable row level security;

revoke all on public.handoff_definitions from public, anon, authenticated;
revoke all on public.handoffs from public, anon, authenticated;
revoke all on public.handoff_events from public, anon, authenticated;
revoke all on function public.reject_handoff_event_mutation() from public, anon, authenticated;
revoke all on function public.ensure_handoff_from_source(text,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.transition_handoff(uuid,text,text,jsonb,uuid,text,text) from public, anon, authenticated;
revoke all on function public.materialize_salu_handoff_request() from public, anon, authenticated;

grant select, insert, update, delete on public.handoff_definitions to service_role;
grant select, insert, update on public.handoffs to service_role;
grant select, insert on public.handoff_events to service_role;
grant execute on function public.reject_handoff_event_mutation() to service_role;
grant execute on function public.ensure_handoff_from_source(text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.transition_handoff(uuid,text,text,jsonb,uuid,text,text) to service_role;
grant execute on function public.materialize_salu_handoff_request() to service_role;

commit;
