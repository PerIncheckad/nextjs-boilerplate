begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Platform boundary for generic handoffs.
-- Existing rows are not rewritten. Canonical writers remain SECURITY DEFINER.

create or replace function public.guard_handoff_write_boundary_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_key text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'REQUESTED' then
      raise exception 'New handoff must start as REQUESTED' using errcode = 'P0001';
    end if;

    if new.handed_over_by is not null
       or new.handed_over_by_email is not null
       or new.handed_over_at is not null
       or new.received_by is not null
       or new.received_by_email is not null
       or new.received_at is not null
       or new.accepted_by is not null
       or new.accepted_by_email is not null
       or new.accepted_at is not null
       or new.completed_by is not null
       or new.completed_by_email is not null
       or new.completed_at is not null
       or new.verified_by is not null
       or new.verified_by_email is not null
       or new.verified_at is not null
       or new.cancelled_by is not null
       or new.cancelled_by_email is not null
       or new.cancelled_at is not null
       or new.cancel_reason is not null
       or new.evidence_refs is distinct from '[]'::jsonb then
      raise exception 'REQUESTED handoff cannot contain transition evidence' using errcode = 'P0001';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Handoff rows cannot be physically deleted' using errcode = 'P0001';
  end if;

  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Write-once identity and provenance from REQUESTED.
  if new.handoff_id is distinct from old.handoff_id
     or new.handoff_code is distinct from old.handoff_code
     or new.handoff_version is distinct from old.handoff_version
     or new.regnr is distinct from old.regnr
     or new.source_system is distinct from old.source_system
     or new.source_entity is distinct from old.source_entity
     or new.source_record_id is distinct from old.source_record_id
     or new.source_event_key is distinct from old.source_event_key
     or new.created_at is distinct from old.created_at then
    raise exception 'Handoff identity/provenance is immutable' using errcode = 'P0001';
  end if;

  -- Known provenance / recipient metadata becomes immutable once established.
  foreach v_key in array array[
    'flagId',
    'sourceEventType',
    'sourcePayload',
    'closureOutcome',
    'closedAt',
    'garageItemId'
  ] loop
    if old.metadata ? v_key then
      if not (new.metadata ? v_key)
         or (new.metadata -> v_key) is distinct from (old.metadata -> v_key) then
        raise exception 'Handoff metadata key % is immutable once established', v_key
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- VERIFIED and CANCELLED are historical terminal truth.
  if old.status in ('VERIFIED', 'CANCELLED') then
    if to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'Terminal handoff is immutable' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Same-state writes may only adjust non-protected workflow metadata / updated_at.
  if new.status is not distinct from old.status then
    if new.handed_over_by is distinct from old.handed_over_by
       or new.handed_over_by_email is distinct from old.handed_over_by_email
       or new.handed_over_at is distinct from old.handed_over_at
       or new.received_by is distinct from old.received_by
       or new.received_by_email is distinct from old.received_by_email
       or new.received_at is distinct from old.received_at
       or new.accepted_by is distinct from old.accepted_by
       or new.accepted_by_email is distinct from old.accepted_by_email
       or new.accepted_at is distinct from old.accepted_at
       or new.completed_by is distinct from old.completed_by
       or new.completed_by_email is distinct from old.completed_by_email
       or new.completed_at is distinct from old.completed_at
       or new.verified_by is distinct from old.verified_by
       or new.verified_by_email is distinct from old.verified_by_email
       or new.verified_at is distinct from old.verified_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancelled_by_email is distinct from old.cancelled_by_email
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancel_reason is distinct from old.cancel_reason
       or new.evidence_refs is distinct from old.evidence_refs then
      raise exception 'Transition evidence may only change with a state transition' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if not (
    (old.status = 'REQUESTED' and new.status in ('HANDED_OVER', 'CANCELLED')) or
    (old.status = 'HANDED_OVER' and new.status in ('RECEIVED', 'CANCELLED')) or
    (old.status = 'RECEIVED' and new.status in ('ACCEPTED', 'CANCELLED')) or
    (old.status = 'ACCEPTED' and new.status in ('COMPLETED', 'CANCELLED')) or
    (old.status = 'COMPLETED' and new.status in ('VERIFIED', 'CANCELLED'))
  ) then
    raise exception 'Invalid handoff transition % -> %', old.status, new.status
      using errcode = 'P0001';
  end if;

  -- A transition may only add evidence for the state being entered.
  if new.status = 'HANDED_OVER' then
    if new.received_by is distinct from old.received_by
       or new.received_by_email is distinct from old.received_by_email
       or new.received_at is distinct from old.received_at
       or new.accepted_by is distinct from old.accepted_by
       or new.accepted_by_email is distinct from old.accepted_by_email
       or new.accepted_at is distinct from old.accepted_at
       or new.completed_by is distinct from old.completed_by
       or new.completed_by_email is distinct from old.completed_by_email
       or new.completed_at is distinct from old.completed_at
       or new.verified_by is distinct from old.verified_by
       or new.verified_by_email is distinct from old.verified_by_email
       or new.verified_at is distinct from old.verified_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancelled_by_email is distinct from old.cancelled_by_email
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancel_reason is distinct from old.cancel_reason
       or new.evidence_refs is distinct from old.evidence_refs then
      raise exception 'HANDED_OVER transition contains foreign transition evidence' using errcode = 'P0001';
    end if;
  elsif new.status = 'RECEIVED' then
    if new.handed_over_by is distinct from old.handed_over_by
       or new.handed_over_by_email is distinct from old.handed_over_by_email
       or new.handed_over_at is distinct from old.handed_over_at
       or new.accepted_by is distinct from old.accepted_by
       or new.accepted_by_email is distinct from old.accepted_by_email
       or new.accepted_at is distinct from old.accepted_at
       or new.completed_by is distinct from old.completed_by
       or new.completed_by_email is distinct from old.completed_by_email
       or new.completed_at is distinct from old.completed_at
       or new.verified_by is distinct from old.verified_by
       or new.verified_by_email is distinct from old.verified_by_email
       or new.verified_at is distinct from old.verified_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancelled_by_email is distinct from old.cancelled_by_email
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancel_reason is distinct from old.cancel_reason
       or new.evidence_refs is distinct from old.evidence_refs then
      raise exception 'RECEIVED transition contains foreign transition evidence' using errcode = 'P0001';
    end if;
  elsif new.status = 'ACCEPTED' then
    if new.handed_over_by is distinct from old.handed_over_by
       or new.handed_over_by_email is distinct from old.handed_over_by_email
       or new.handed_over_at is distinct from old.handed_over_at
       or new.received_by is distinct from old.received_by
       or new.received_by_email is distinct from old.received_by_email
       or new.received_at is distinct from old.received_at
       or new.completed_by is distinct from old.completed_by
       or new.completed_by_email is distinct from old.completed_by_email
       or new.completed_at is distinct from old.completed_at
       or new.verified_by is distinct from old.verified_by
       or new.verified_by_email is distinct from old.verified_by_email
       or new.verified_at is distinct from old.verified_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancelled_by_email is distinct from old.cancelled_by_email
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancel_reason is distinct from old.cancel_reason
       or new.evidence_refs is distinct from old.evidence_refs then
      raise exception 'ACCEPTED transition contains foreign transition evidence' using errcode = 'P0001';
    end if;
  elsif new.status = 'COMPLETED' then
    if new.handed_over_by is distinct from old.handed_over_by
       or new.handed_over_by_email is distinct from old.handed_over_by_email
       or new.handed_over_at is distinct from old.handed_over_at
       or new.received_by is distinct from old.received_by
       or new.received_by_email is distinct from old.received_by_email
       or new.received_at is distinct from old.received_at
       or new.accepted_by is distinct from old.accepted_by
       or new.accepted_by_email is distinct from old.accepted_by_email
       or new.accepted_at is distinct from old.accepted_at
       or new.verified_by is distinct from old.verified_by
       or new.verified_by_email is distinct from old.verified_by_email
       or new.verified_at is distinct from old.verified_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancelled_by_email is distinct from old.cancelled_by_email
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancel_reason is distinct from old.cancel_reason
       or new.evidence_refs is distinct from old.evidence_refs then
      raise exception 'COMPLETED transition contains foreign transition evidence' using errcode = 'P0001';
    end if;
  elsif new.status = 'VERIFIED' then
    if new.handed_over_by is distinct from old.handed_over_by
       or new.handed_over_by_email is distinct from old.handed_over_by_email
       or new.handed_over_at is distinct from old.handed_over_at
       or new.received_by is distinct from old.received_by
       or new.received_by_email is distinct from old.received_by_email
       or new.received_at is distinct from old.received_at
       or new.accepted_by is distinct from old.accepted_by
       or new.accepted_by_email is distinct from old.accepted_by_email
       or new.accepted_at is distinct from old.accepted_at
       or new.completed_by is distinct from old.completed_by
       or new.completed_by_email is distinct from old.completed_by_email
       or new.completed_at is distinct from old.completed_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancelled_by_email is distinct from old.cancelled_by_email
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancel_reason is distinct from old.cancel_reason then
      raise exception 'VERIFIED transition contains foreign transition evidence' using errcode = 'P0001';
    end if;
  elsif new.status = 'CANCELLED' then
    if new.handed_over_by is distinct from old.handed_over_by
       or new.handed_over_by_email is distinct from old.handed_over_by_email
       or new.handed_over_at is distinct from old.handed_over_at
       or new.received_by is distinct from old.received_by
       or new.received_by_email is distinct from old.received_by_email
       or new.received_at is distinct from old.received_at
       or new.accepted_by is distinct from old.accepted_by
       or new.accepted_by_email is distinct from old.accepted_by_email
       or new.accepted_at is distinct from old.accepted_at
       or new.completed_by is distinct from old.completed_by
       or new.completed_by_email is distinct from old.completed_by_email
       or new.completed_at is distinct from old.completed_at
       or new.verified_by is distinct from old.verified_by
       or new.verified_by_email is distinct from old.verified_by_email
       or new.verified_at is distinct from old.verified_at
       or new.evidence_refs is distinct from old.evidence_refs then
      raise exception 'CANCELLED transition contains foreign transition evidence' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists handoffs_write_boundary_v1 on public.handoffs;
create trigger handoffs_write_boundary_v1
before insert or update or delete on public.handoffs
for each row execute function public.guard_handoff_write_boundary_v1();

create or replace function public.reject_handoff_truncate_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'Handoff history cannot be truncated' using errcode = 'P0001';
end;
$$;

drop trigger if exists handoffs_reject_truncate_v1 on public.handoffs;
create trigger handoffs_reject_truncate_v1
before truncate on public.handoffs
for each statement execute function public.reject_handoff_truncate_v1();

drop trigger if exists handoff_events_reject_truncate_v1 on public.handoff_events;
create trigger handoff_events_reject_truncate_v1
before truncate on public.handoff_events
for each statement execute function public.reject_handoff_truncate_v1();

-- True idempotency: create once, otherwise return the exact same historical fact.
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
  v_created boolean := false;
  v_key text;
  v_regnr text := upper(trim(p_regnr));
  v_source_system text := trim(p_source_system);
  v_source_entity text := nullif(trim(coalesce(p_source_entity, '')), '');
  v_source_record_id text := trim(p_source_record_id);
  v_source_event_key text := nullif(trim(coalesce(p_source_event_key, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if pg_catalog.jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'Handoff metadata must be an object' using errcode = '22023';
  end if;

  select * into v_definition
  from public.handoff_definitions
  where handoff_code = upper(trim(p_handoff_code))
    and active
  order by handoff_version desc
  limit 1;

  if not found then
    raise exception 'Active handoff definition not found' using errcode = 'P0002';
  end if;

  select * into v_handoff
  from public.handoffs
  where handoff_code = v_definition.handoff_code
    and handoff_version = v_definition.handoff_version
    and source_system = v_source_system
    and source_record_id = v_source_record_id
  limit 1;

  if not found then
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
      v_regnr,
      v_source_system,
      v_source_entity,
      v_source_record_id,
      v_source_event_key,
      v_metadata
    )
    on conflict (handoff_code, handoff_version, source_system, source_record_id)
    do nothing
    returning * into v_handoff;

    if found then
      v_created := true;
    else
      select * into v_handoff
      from public.handoffs
      where handoff_code = v_definition.handoff_code
        and handoff_version = v_definition.handoff_version
        and source_system = v_source_system
        and source_record_id = v_source_record_id
      limit 1;

      if not found then
        raise exception 'Handoff conflict could not be resolved safely' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if not v_created then
    if v_handoff.handoff_code is distinct from v_definition.handoff_code
       or v_handoff.handoff_version is distinct from v_definition.handoff_version
       or v_handoff.regnr is distinct from v_regnr
       or v_handoff.source_system is distinct from v_source_system
       or v_handoff.source_entity is distinct from v_source_entity
       or v_handoff.source_record_id is distinct from v_source_record_id
       or v_handoff.source_event_key is distinct from v_source_event_key then
      raise exception 'Existing handoff has conflicting immutable identity/provenance'
        using errcode = 'P0001';
    end if;

    foreach v_key in array array[
      'flagId',
      'sourceEventType',
      'sourcePayload',
      'closureOutcome',
      'closedAt',
      'garageItemId'
    ] loop
      if (v_handoff.metadata ? v_key) <> (v_metadata ? v_key)
         or (v_handoff.metadata -> v_key) is distinct from (v_metadata -> v_key) then
        raise exception 'Existing handoff has conflicting immutable metadata key %', v_key
          using errcode = 'P0001';
      end if;
    end loop;

    return to_jsonb(v_handoff);
  end if;

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

  return to_jsonb(v_handoff);
end;
$$;

-- Runtime can read the projection and execute canonical SECURITY DEFINER writers,
-- but cannot mutate or truncate the backing history tables directly.
revoke all privileges on table public.handoffs from public, anon, authenticated, service_role;
revoke all privileges on table public.handoff_events from public, anon, authenticated, service_role;

grant select on table public.handoffs to service_role;
grant select on table public.handoff_events to service_role;

revoke all on function public.guard_handoff_write_boundary_v1() from public, anon, authenticated;
revoke all on function public.reject_handoff_truncate_v1() from public, anon, authenticated;
revoke all on function public.ensure_handoff_from_source(text,text,text,text,text,text,jsonb)
  from public, anon, authenticated;

grant execute on function public.ensure_handoff_from_source(text,text,text,text,text,text,jsonb)
  to service_role;

commit;
