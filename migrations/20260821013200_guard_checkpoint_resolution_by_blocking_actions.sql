begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A verified action becomes terminal, but the checkpoint itself must remain an
-- AVVIKELSE while another blocking action for the same checkpoint is still open.
-- This keeps action completion separate from final checkpoint resolution.
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
  v_assessment_comment text;
  v_assessment_result jsonb;
  v_assessment_id uuid;
  v_remaining_blocking_actions integer := 0;
begin
  if p_outcome not in (
    'ATGARDAD',
    'ACCEPTERAD_AVVIKELSE',
    'EJ_RELEVANT',
    'FORTSATT_AVVIKELSE'
  ) then
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

  select count(*)::integer
  into v_remaining_blocking_actions
  from public.checkpoint_actions
  where checkpoint_id = v_action.checkpoint_id
    and action_id <> p_action_id
    and blocking
    and status not in ('VERIFIED', 'CANCELLED');

  v_checkpoint_status := case
    when p_outcome = 'FORTSATT_AVVIKELSE' then 'AVVIKELSE'
    when v_remaining_blocking_actions > 0 then 'AVVIKELSE'
    when p_outcome in ('ATGARDAD', 'ACCEPTERAD_AVVIKELSE') then 'GODKAND'
    when p_outcome = 'EJ_RELEVANT' then 'EJ_RELEVANT'
    else 'AVVIKELSE'
  end;

  v_assessment_comment := nullif(trim(coalesce(p_comment, '')), '');

  if v_remaining_blocking_actions > 0 and p_outcome <> 'FORTSATT_AVVIKELSE' then
    v_assessment_comment := concat_ws(
      ' ',
      v_assessment_comment,
      'Åtgärden verifierades, men ' || v_remaining_blocking_actions::text ||
        ' annan blockerande åtgärd återstår.'
    );
  end if;

  v_assessment_result := public.assess_vehicle_checkpoint(
    v_action.checkpoint_id,
    v_checkpoint_status,
    v_assessment_comment,
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
      'evidenceRefs', coalesce(p_evidence_refs, '[]'::jsonb),
      'remainingBlockingActions', v_remaining_blocking_actions,
      'checkpointResolved', v_checkpoint_status <> 'AVVIKELSE'
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
      'evidenceRefs', coalesce(p_evidence_refs, '[]'::jsonb),
      'remainingBlockingActions', v_remaining_blocking_actions,
      'checkpointResolved', v_checkpoint_status <> 'AVVIKELSE'
    )
  );

  return to_jsonb(v_action) || pg_catalog.jsonb_build_object(
    'checkpoint_status', v_checkpoint_status,
    'remaining_blocking_actions', v_remaining_blocking_actions,
    'checkpoint_resolved', v_checkpoint_status <> 'AVVIKELSE'
  );
end;
$$;

revoke all on function public.verify_checkpoint_action(uuid, text, text, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.verify_checkpoint_action(uuid, text, text, jsonb, uuid, text)
  to service_role;

commit;
