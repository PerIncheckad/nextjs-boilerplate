-- SALU decision-cycle and handoff contract.
-- Keeps SALU as the source process while emitting explicit events for future
-- PLANERING and INKÖP layers. Server-side only.

begin;

set local lock_timeout = '5s';

alter table public.salu_flags
  drop constraint if exists salu_flags_closure_outcome_check;

alter table public.salu_flags
  add constraint salu_flags_closure_outcome_check
  check (
    closure_outcome is null
    or closure_outcome in (
      'SÄLJAS',
      'PLANERA VERKSTAD',
      'LÅNGTID PLANERA SKIFTE',
      'ANNAT',
      'FÖRLÄNGA'
    )
  );

alter table public.salu_events
  drop constraint if exists salu_events_event_type_check;

alter table public.salu_events
  add constraint salu_events_event_type_check
  check (event_type in (
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
    'SALU_PLANERING_HANDOFF_REQUESTED',
    'SALU_INKOP_HANDOFF_REQUESTED',
    'SALU_DECISION_REMINDER_DUE',
    'SALU_T10_ESCALATED',
    'SALU_T0_PASSED',
    'SALU_FLAG_READY_FOR_OWNER_DECISION',
    'SALU_FLAG_CLOSED_MANUALLY'
  ));

create or replace function public.apply_salu_trigger_action(
  p_regnr text,
  p_saludatum date,
  p_event_type text,
  p_event_key text
)
returns table (
  applied boolean,
  flag_id uuid,
  escalation_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_flag_id uuid;
  v_escalation text;
begin
  if p_event_type not in (
    'SALU_FLAG_CREATED',
    'SALU_DECISION_REMINDER_DUE',
    'SALU_T10_ESCALATED',
    'SALU_T0_PASSED'
  ) then
    raise exception 'Unsupported SALU trigger event';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_regnr));

  if exists (select 1 from public.salu_events e where e.event_key = p_event_key) then
    select f.flag_id, f.escalation_status
      into v_flag_id, v_escalation
    from public.salu_flags f
    where f.regnr = p_regnr and f.status <> 'STÄNGD'
    limit 1;

    return query select false, v_flag_id, v_escalation;
    return;
  end if;

  if p_event_type = 'SALU_FLAG_CREATED' then
    if exists (
      select 1 from public.salu_flags f
      where f.regnr = p_regnr and f.status <> 'STÄNGD'
    ) then
      raise exception 'Active SALU flag already exists';
    end if;

    insert into public.salu_flags (
      regnr,
      cycle_saludatum,
      current_saludatum,
      status,
      escalation_status,
      owner_function
    ) values (
      p_regnr,
      p_saludatum,
      p_saludatum,
      'NY',
      'NORMAL',
      'BILKONTROLL'
    )
    returning salu_flags.flag_id into v_flag_id;

    v_escalation := 'NORMAL';

    insert into public.salu_events (
      regnr,
      flag_id,
      event_type,
      event_key,
      actor_source,
      payload
    ) values
      (
        p_regnr,
        v_flag_id,
        'SALU_PLANERING_HANDOFF_REQUESTED',
        'SALU_PLANERING_HANDOFF_REQUESTED:' || v_flag_id::text,
        'SYSTEM',
        pg_catalog.jsonb_build_object(
          'source_event_key', p_event_key,
          'saludatum', p_saludatum,
          'target_layer', 'PLANERING'
        )
      ),
      (
        p_regnr,
        v_flag_id,
        'SALU_INKOP_HANDOFF_REQUESTED',
        'SALU_INKOP_HANDOFF_REQUESTED:' || v_flag_id::text,
        'SYSTEM',
        pg_catalog.jsonb_build_object(
          'source_event_key', p_event_key,
          'saludatum', p_saludatum,
          'target_layer', 'INKÖP'
        )
      )
    on conflict (event_key) do nothing;
  else
    select f.flag_id, f.escalation_status
      into v_flag_id, v_escalation
    from public.salu_flags f
    where f.regnr = p_regnr and f.status <> 'STÄNGD'
    for update;

    if v_flag_id is null then
      raise exception 'No active SALU flag exists for trigger action';
    end if;

    if p_event_type = 'SALU_T0_PASSED' then
      v_escalation := 'PASSERAD';
      update public.salu_flags
      set escalation_status = v_escalation
      where salu_flags.flag_id = v_flag_id;
    elsif p_event_type = 'SALU_T10_ESCALATED' then
      v_escalation := 'T10';
      update public.salu_flags
      set escalation_status = v_escalation
      where salu_flags.flag_id = v_flag_id;
    end if;
  end if;

  insert into public.salu_events (
    regnr,
    flag_id,
    event_type,
    event_key,
    actor_source,
    payload
  ) values (
    p_regnr,
    v_flag_id,
    p_event_type,
    p_event_key,
    'SYSTEM',
    case
      when p_event_type = 'SALU_DECISION_REMINDER_DUE' then
        pg_catalog.jsonb_build_object(
          'saludatum', p_saludatum,
          'decision_required', true,
          'decision_options', pg_catalog.jsonb_build_array(
            'SÄLJAS',
            'PLANERA VERKSTAD',
            'LÅNGTID PLANERA SKIFTE',
            'ANNAT',
            'FÖRLÄNGA'
          )
        )
      else pg_catalog.jsonb_build_object('saludatum', p_saludatum)
    end
  );

  return query select true, v_flag_id, v_escalation;
end;
$$;

revoke all on function public.apply_salu_trigger_action(text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_salu_trigger_action(text, date, text, text)
  to service_role;

commit;
