begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Preserve the actual prior status in immutable history and derive the journey
-- event key from the durable action event instead of wall-clock text.
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
  v_previous_status text;
  v_allowed boolean := false;
  v_event_type text := 'ACTION_STATUS_CHANGED';
  v_action_event_id uuid;
begin
  select * into v_action
  from public.checkpoint_actions
  where action_id = p_action_id
  for update;

  if not found then
    raise exception 'Checkpoint action not found' using errcode = 'P0002';
  end if;

  v_previous_status := v_action.status;

  select * into v_checkpoint
  from public.vehicle_checkpoints
  where checkpoint_id = v_action.checkpoint_id;

  if v_previous_status in ('VERIFIED', 'CANCELLED') then
    raise exception 'Terminal checkpoint action cannot transition' using errcode = 'P0001';
  end if;

  v_allowed := case
    when v_previous_status = 'CREATED' and p_next_status in ('ACCEPTED', 'CANCELLED') then true
    when v_previous_status = 'ACCEPTED' and p_next_status in ('IN_PROGRESS', 'CANCELLED') then true
    when v_previous_status = 'IN_PROGRESS' and p_next_status in ('READY_FOR_VERIFICATION', 'CANCELLED') then true
    when v_previous_status = 'READY_FOR_VERIFICATION' and p_next_status in ('IN_PROGRESS', 'CANCELLED') then true
    else false
  end;

  if not v_allowed then
    raise exception 'Invalid checkpoint action transition % -> %', v_previous_status, p_next_status
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
    v_previous_status,
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
  )
  returning action_event_id into v_action_event_id;

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
    'checkpoint-action-event:' || v_action_event_id::text,
    pg_catalog.now(),
    'CHECKPOINT_ENGINE',
    'checkpoint_action_events',
    v_action_event_id::text,
    p_actor_id,
    'MANUELL',
    p_actor_email,
    pg_catalog.jsonb_build_object(
      'actionId', p_action_id,
      'checkpointId', v_action.checkpoint_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'previousStatus', v_previous_status,
      'status', p_next_status,
      'comment', nullif(trim(coalesce(p_comment, '')), ''),
      'blocking', v_action.blocking,
      'deadlineAt', v_action.deadline_at
    )
  );

  return to_jsonb(v_action);
end;
$$;

revoke all on function public.transition_checkpoint_action(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.transition_checkpoint_action(uuid, text, text, uuid, text)
  to service_role;

commit;
