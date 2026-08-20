-- 4.1B SALU atomic scheduler trigger persistence.
-- Server-side only. Catch-up policy is deliberately not implemented here.

begin;

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
  if p_event_type not in ('SALU_FLAG_CREATED', 'SALU_T10_ESCALATED', 'SALU_T0_PASSED') then
    raise exception 'Unsupported SALU trigger event';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_regnr));

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
  else
    select f.flag_id
      into v_flag_id
    from public.salu_flags f
    where f.regnr = p_regnr and f.status <> 'STÄNGD'
    for update;

    if v_flag_id is null then
      raise exception 'No active SALU flag exists for escalation';
    end if;

    v_escalation := case
      when p_event_type = 'SALU_T0_PASSED' then 'PASSERAD'
      else 'T10'
    end;

    update public.salu_flags
    set escalation_status = v_escalation
    where salu_flags.flag_id = v_flag_id;
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
    jsonb_build_object('saludatum', p_saludatum)
  );

  return query select true, v_flag_id, v_escalation;
end;
$$;

revoke all on function public.apply_salu_trigger_action(text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_salu_trigger_action(text, date, text, text)
  to service_role;

commit;
