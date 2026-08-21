begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.append_checkpoint_action_timer_event(
  p_action_id uuid,
  p_event_type text,
  p_timer_status text,
  p_occurred_at timestamptz,
  p_event_key text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_action public.checkpoint_actions%rowtype;
  v_checkpoint public.vehicle_checkpoints%rowtype;
  v_action_event_id uuid;
  v_journey_event_type text;
begin
  if p_event_type not in ('ACTION_DUE_SOON', 'ACTION_OVERDUE', 'ACTION_ESCALATED', 'ACTION_REMINDER_DUE') then
    raise exception 'Invalid checkpoint action timer event type' using errcode = '22023';
  end if;

  if p_timer_status not in ('DUE_SOON', 'OVERDUE', 'ESCALATED') then
    raise exception 'Invalid checkpoint action timer status' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_event_key, ''))) = 0 then
    raise exception 'Timer event key is required' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Timer event payload must be an object' using errcode = '22023';
  end if;

  select * into v_action
  from public.checkpoint_actions
  where action_id = p_action_id;

  if not found then
    raise exception 'Checkpoint action not found' using errcode = 'P0002';
  end if;

  select * into v_checkpoint
  from public.vehicle_checkpoints
  where checkpoint_id = v_action.checkpoint_id;

  if not found then
    raise exception 'Checkpoint not found for action' using errcode = 'P0002';
  end if;

  insert into public.checkpoint_action_events (
    action_id,
    checkpoint_id,
    event_key,
    event_type,
    previous_status,
    status,
    actor_source,
    occurred_at,
    payload
  ) values (
    p_action_id,
    v_action.checkpoint_id,
    trim(p_event_key),
    p_event_type,
    v_action.status,
    v_action.status,
    'SYSTEM',
    coalesce(p_occurred_at, pg_catalog.now()),
    coalesce(p_payload, '{}'::jsonb) || pg_catalog.jsonb_build_object(
      'actionId', p_action_id,
      'checkpointId', v_action.checkpoint_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'timerStatus', p_timer_status,
      'deadlineAt', v_action.deadline_at,
      'ownerFunction', v_action.owner_function,
      'ownerRef', v_action.owner_ref,
      'blocking', v_action.blocking,
      'timerRuleCode', v_action.timer_rule_code,
      'timerRuleVersion', v_action.timer_rule_version
    )
  )
  on conflict do nothing
  returning action_event_id into v_action_event_id;

  if v_action_event_id is null then
    return null;
  end if;

  v_journey_event_type := case p_event_type
    when 'ACTION_DUE_SOON' then 'CHECKPOINT_ACTION_DUE_SOON'
    when 'ACTION_OVERDUE' then 'CHECKPOINT_ACTION_OVERDUE'
    when 'ACTION_ESCALATED' then 'CHECKPOINT_ACTION_ESCALATED'
    else 'CHECKPOINT_ACTION_REMINDER_DUE'
  end;

  insert into public.vehicle_journey_events (
    regnr,
    event_type,
    event_key,
    occurred_at,
    source_system,
    source_entity,
    source_record_id,
    actor_source,
    payload
  ) values (
    v_checkpoint.regnr,
    v_journey_event_type,
    'checkpoint-action-timer:' || trim(p_event_key),
    coalesce(p_occurred_at, pg_catalog.now()),
    'CHECKPOINT_ENGINE',
    'checkpoint_action_events',
    v_action_event_id::text,
    'SYSTEM',
    coalesce(p_payload, '{}'::jsonb) || pg_catalog.jsonb_build_object(
      'actionEventId', v_action_event_id,
      'actionId', p_action_id,
      'checkpointId', v_action.checkpoint_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'timerStatus', p_timer_status,
      'deadlineAt', v_action.deadline_at,
      'ownerFunction', v_action.owner_function,
      'ownerRef', v_action.owner_ref,
      'blocking', v_action.blocking,
      'timerRuleCode', v_action.timer_rule_code,
      'timerRuleVersion', v_action.timer_rule_version
    )
  );

  return v_action_event_id;
end;
$$;

create or replace function public.run_checkpoint_action_timers(
  p_evaluated_at timestamptz default now(),
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := coalesce(p_evaluated_at, pg_catalog.now());
  v_row record;
  v_due_soon_at timestamptz;
  v_overdue_at timestamptz;
  v_escalation_at timestamptz;
  v_interval interval;
  v_target_status text;
  v_current_rank integer;
  v_target_rank integer;
  v_events jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_last_reminder_at timestamptz;
  v_next_timer_at timestamptz;
  v_reminder_count integer;
  v_processed integer := 0;
  v_due_soon integer := 0;
  v_overdue integer := 0;
  v_escalated integer := 0;
  v_reminders integer := 0;
  v_event_key text;
  v_payload jsonb;
begin
  for v_row in
    select
      action.*,
      checkpoint.regnr,
      checkpoint.checkpoint_code,
      rule.due_soon_hours,
      rule.escalation_after_hours,
      rule.reminder_interval_hours
    from public.checkpoint_actions action
    join public.vehicle_checkpoints checkpoint
      on checkpoint.checkpoint_id = action.checkpoint_id
    join public.checkpoint_action_timer_rules rule
      on rule.rule_code = action.timer_rule_code
     and rule.rule_version = action.timer_rule_version
    where action.status not in ('VERIFIED', 'CANCELLED')
      and action.next_timer_at is not null
      and action.next_timer_at <= v_now
    order by action.next_timer_at, action.action_id
    for update of action skip locked
  loop
    v_processed := v_processed + 1;
    v_events := '[]'::jsonb;
    v_due_soon_at := v_row.deadline_at - pg_catalog.make_interval(hours => v_row.due_soon_hours);
    v_overdue_at := v_row.deadline_at;
    v_escalation_at := v_row.deadline_at + pg_catalog.make_interval(hours => v_row.escalation_after_hours);
    v_interval := pg_catalog.make_interval(hours => v_row.reminder_interval_hours);
    v_last_reminder_at := v_row.last_reminder_at;
    v_reminder_count := v_row.reminder_count;

    v_target_status := case
      when v_now >= v_escalation_at then 'ESCALATED'
      when v_now >= v_overdue_at then 'OVERDUE'
      when v_now >= v_due_soon_at then 'DUE_SOON'
      else 'NORMAL'
    end;

    v_current_rank := case v_row.timer_status
      when 'NORMAL' then 0
      when 'DUE_SOON' then 1
      when 'OVERDUE' then 2
      when 'ESCALATED' then 3
      else 4
    end;
    v_target_rank := case v_target_status
      when 'NORMAL' then 0
      when 'DUE_SOON' then 1
      when 'OVERDUE' then 2
      when 'ESCALATED' then 3
      else 4
    end;

    if v_target_rank < v_current_rank then
      v_target_status := v_row.timer_status;
      v_target_rank := v_current_rank;
    end if;

    if v_row.due_soon_hours > 0
       and v_current_rank < 1
       and v_target_rank >= 1 then
      v_event_key := 'action-timer:' || v_row.action_id::text || ':DUE_SOON';
      v_payload := pg_catalog.jsonb_build_object(
        'thresholdAt', v_due_soon_at,
        'evaluatedAt', v_now,
        'previousTimerStatus', v_row.timer_status,
        'timerStatus', 'DUE_SOON'
      );
      v_events := v_events || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('eventType', 'ACTION_DUE_SOON', 'eventKey', v_event_key, 'occurredAt', v_due_soon_at)
      );
      v_due_soon := v_due_soon + 1;
      if p_apply then
        perform public.append_checkpoint_action_timer_event(
          v_row.action_id, 'ACTION_DUE_SOON', 'DUE_SOON', v_due_soon_at, v_event_key, v_payload
        );
      end if;
    end if;

    if v_current_rank < 2
       and v_target_rank >= 2 then
      v_event_key := 'action-timer:' || v_row.action_id::text || ':OVERDUE';
      v_payload := pg_catalog.jsonb_build_object(
        'thresholdAt', v_overdue_at,
        'evaluatedAt', v_now,
        'previousTimerStatus', v_row.timer_status,
        'timerStatus', 'OVERDUE'
      );
      v_events := v_events || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('eventType', 'ACTION_OVERDUE', 'eventKey', v_event_key, 'occurredAt', v_overdue_at)
      );
      v_overdue := v_overdue + 1;
      if p_apply then
        perform public.append_checkpoint_action_timer_event(
          v_row.action_id, 'ACTION_OVERDUE', 'OVERDUE', v_overdue_at, v_event_key, v_payload
        );
      end if;
    end if;

    if v_current_rank < 3
       and v_target_rank >= 3 then
      v_event_key := 'action-timer:' || v_row.action_id::text || ':ESCALATED';
      v_payload := pg_catalog.jsonb_build_object(
        'thresholdAt', v_escalation_at,
        'evaluatedAt', v_now,
        'previousTimerStatus', v_row.timer_status,
        'timerStatus', 'ESCALATED'
      );
      v_events := v_events || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('eventType', 'ACTION_ESCALATED', 'eventKey', v_event_key, 'occurredAt', v_escalation_at)
      );
      v_escalated := v_escalated + 1;
      if p_apply then
        perform public.append_checkpoint_action_timer_event(
          v_row.action_id, 'ACTION_ESCALATED', 'ESCALATED', v_escalation_at, v_event_key, v_payload
        );
      end if;
    end if;

    if v_target_status <> 'NORMAL'
       and (
         v_last_reminder_at is null
         or v_last_reminder_at + v_interval <= v_now
       ) then
      v_reminder_count := v_reminder_count + 1;
      v_last_reminder_at := v_now;
      v_event_key := 'action-reminder:' || v_row.action_id::text || ':' || v_reminder_count::text;
      v_payload := pg_catalog.jsonb_build_object(
        'evaluatedAt', v_now,
        'timerStatus', v_target_status,
        'reminderNumber', v_reminder_count
      );
      v_events := v_events || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('eventType', 'ACTION_REMINDER_DUE', 'eventKey', v_event_key, 'occurredAt', v_now)
      );
      v_reminders := v_reminders + 1;
      if p_apply then
        perform public.append_checkpoint_action_timer_event(
          v_row.action_id, 'ACTION_REMINDER_DUE', v_target_status, v_now, v_event_key, v_payload
        );
      end if;
    end if;

    v_next_timer_at := case v_target_status
      when 'NORMAL' then v_due_soon_at
      when 'DUE_SOON' then least(
        v_overdue_at,
        coalesce(v_last_reminder_at, v_now) + v_interval
      )
      when 'OVERDUE' then least(
        v_escalation_at,
        coalesce(v_last_reminder_at, v_now) + v_interval
      )
      else coalesce(v_last_reminder_at, v_now) + v_interval
    end;

    if p_apply then
      update public.checkpoint_actions
      set timer_status = v_target_status,
          reminder_count = v_reminder_count,
          last_reminder_at = v_last_reminder_at,
          overdue_at = case
            when v_target_rank >= 2 then coalesce(overdue_at, v_overdue_at)
            else overdue_at
          end,
          escalated_at = case
            when v_target_rank >= 3 then coalesce(escalated_at, v_escalation_at)
            else escalated_at
          end,
          next_timer_at = v_next_timer_at,
          updated_at = pg_catalog.now()
      where action_id = v_row.action_id;
    end if;

    v_actions := v_actions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'actionId', v_row.action_id,
        'regnr', v_row.regnr,
        'checkpointId', v_row.checkpoint_id,
        'checkpointCode', v_row.checkpoint_code,
        'workflowStatus', v_row.status,
        'previousTimerStatus', v_row.timer_status,
        'timerStatus', v_target_status,
        'deadlineAt', v_row.deadline_at,
        'nextTimerAt', v_next_timer_at,
        'events', v_events
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'evaluatedAt', v_now,
    'applied', p_apply,
    'processedActions', v_processed,
    'events', pg_catalog.jsonb_build_object(
      'dueSoon', v_due_soon,
      'overdue', v_overdue,
      'escalated', v_escalated,
      'reminders', v_reminders,
      'total', v_due_soon + v_overdue + v_escalated + v_reminders
    ),
    'actions', v_actions
  );
end;
$$;

revoke all on function public.append_checkpoint_action_timer_event(uuid, text, text, timestamptz, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.run_checkpoint_action_timers(timestamptz, boolean)
  from public, anon, authenticated;

grant execute on function public.append_checkpoint_action_timer_event(uuid, text, text, timestamptz, text, jsonb)
  to service_role;
grant execute on function public.run_checkpoint_action_timers(timestamptz, boolean)
  to service_role;

commit;
