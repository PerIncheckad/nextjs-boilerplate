-- 4.1B SALU atomic vehicle-plan persistence.
-- Application calls this server-side through service_role only.

begin;

create or replace function public.apply_salu_vehicle_plan(
  p_regnr text,
  p_ny_date date,
  p_saludatum date,
  p_control_mode text,
  p_manual_months integer,
  p_auto_rule_id uuid,
  p_auto_rule_version integer,
  p_auto_months_applied integer,
  p_actor_id uuid
)
returns table (
  original_saludatum date,
  previous_saludatum date,
  current_saludatum date,
  changed boolean
)
language plpgsql
as $$
declare
  v_existing_original date;
  v_existing_current date;
  v_original date;
begin
  if p_control_mode not in ('AUTO', 'MANUELL') then
    raise exception 'Invalid SALU control mode';
  end if;

  if p_saludatum < p_ny_date then
    raise exception 'SALU date cannot be before NY date';
  end if;

  if p_control_mode = 'MANUELL' then
    if p_manual_months is null or p_manual_months <= 0 then
      raise exception 'MANUELL requires positive manual months';
    end if;
    if p_auto_rule_id is not null or p_auto_rule_version is not null or p_auto_months_applied is not null then
      raise exception 'MANUELL cannot persist AUTO rule metadata';
    end if;
  else
    if p_manual_months is not null then
      raise exception 'AUTO cannot persist manual months';
    end if;
    if p_auto_rule_id is null or p_auto_rule_version is null or p_auto_months_applied is null then
      raise exception 'AUTO requires exact rule metadata';
    end if;
  end if;

  select s.original_saludatum, s.current_saludatum
    into v_existing_original, v_existing_current
  from public.salu_vehicle_state s
  where s.regnr = p_regnr
  for update;

  v_original := coalesce(v_existing_original, p_saludatum);

  insert into public.salu_vehicle_state (
    regnr,
    ny_date,
    original_saludatum,
    current_saludatum,
    control_mode,
    manual_months,
    auto_rule_id,
    auto_rule_version,
    auto_months_applied,
    updated_by,
    updated_at
  ) values (
    p_regnr,
    p_ny_date,
    v_original,
    p_saludatum,
    p_control_mode,
    p_manual_months,
    p_auto_rule_id,
    p_auto_rule_version,
    p_auto_months_applied,
    p_actor_id,
    now()
  )
  on conflict (regnr) do update set
    ny_date = excluded.ny_date,
    original_saludatum = public.salu_vehicle_state.original_saludatum,
    current_saludatum = excluded.current_saludatum,
    control_mode = excluded.control_mode,
    manual_months = excluded.manual_months,
    auto_rule_id = excluded.auto_rule_id,
    auto_rule_version = excluded.auto_rule_version,
    auto_months_applied = excluded.auto_months_applied,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  if v_existing_current is distinct from p_saludatum then
    insert into public.salu_events (
      regnr,
      event_type,
      actor_id,
      actor_source,
      payload
    ) values (
      p_regnr,
      'SALU_SALUDATUM_CHANGED',
      p_actor_id,
      'MANUELL',
      jsonb_build_object(
        'old_saludatum', v_existing_current,
        'new_saludatum', p_saludatum,
        'source', p_control_mode,
        'auto_rule_id', p_auto_rule_id,
        'auto_rule_version', p_auto_rule_version,
        'months_applied', coalesce(p_auto_months_applied, p_manual_months)
      )
    );
  end if;

  return query
  select
    v_original,
    v_existing_current,
    p_saludatum,
    v_existing_current is distinct from p_saludatum;
end;
$$;

revoke all on function public.apply_salu_vehicle_plan(
  text, date, date, text, integer, uuid, integer, integer, uuid
) from public, anon, authenticated;

grant execute on function public.apply_salu_vehicle_plan(
  text, date, date, text, integer, uuid, integer, integer, uuid
) to service_role;

commit;
