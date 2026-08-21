begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Nybil is an authoritative lifecycle baseline, but it must not invent rental.
-- The explicit rental-readiness flag establishes only the initial primary state:
-- true  => AVAILABLE
-- false => PREPARATION
-- null  => no period fact yet
--
-- This adapter is insert-only. Later operational status changes belong to their
-- own authoritative sources (for example vehicle_edits), not to baseline edits.
create unique index if not exists vehicle_journey_periods_nybil_source_uidx
  on public.vehicle_journey_periods (source_record_id)
  where source_system = 'NYBIL'
    and source_entity = 'nybil_inventering'
    and source_record_id is not null;

create or replace function public.try_write_through_nybil_period(
  p_nybil_id uuid,
  p_regnr text,
  p_ready boolean,
  p_created_at timestamptz,
  p_registered_by text,
  p_is_duplicate boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text;
  v_source_record_id text;
  v_target_state text;
  v_error_code text;
  v_error_message text;
begin
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  v_source_record_id := p_nybil_id::text;

  if v_regnr = '' or p_nybil_id is null then
    return false;
  end if;

  if coalesce(p_is_duplicate, false) then
    return true;
  end if;

  if p_ready is null then
    return true;
  end if;

  v_target_state := case when p_ready then 'AVAILABLE' else 'PREPARATION' end;

  begin
    if exists (
      select 1
      from public.vehicle_journey_periods
      where source_system = 'NYBIL'
        and source_entity = 'nybil_inventering'
        and source_record_id = v_source_record_id
    ) then
      update public.period_write_through_failures
      set resolved_at = coalesce(resolved_at, pg_catalog.now())
      where source_entity = 'nybil_inventering'
        and source_record_id = v_source_record_id
        and resolved_at is null;
      return true;
    end if;

    if exists (
      select 1
      from public.vehicle_journey_periods
      where regnr = v_regnr
        and ended_at is null
    ) then
      return true;
    end if;

    perform public.transition_vehicle_journey_state(
      gen_random_uuid(),
      v_regnr,
      v_target_state,
      coalesce(p_created_at, pg_catalog.now()),
      null,
      null,
      'NYBIL',
      'nybil_inventering',
      v_source_record_id,
      null,
      'MANUELL',
      nullif(trim(coalesce(p_registered_by, '')), ''),
      pg_catalog.jsonb_build_object(
        'sourceKind', 'NYBIL_BASELINE',
        'sourceField', 'klar_for_uthyrning',
        'readyForRental', p_ready,
        'establishesInitialStateOnly', true
      )
    );

    update public.period_write_through_failures
    set resolved_at = coalesce(resolved_at, pg_catalog.now())
    where source_entity = 'nybil_inventering'
      and source_record_id = v_source_record_id
      and resolved_at is null;

    return true;
  exception when others then
    v_error_code := SQLSTATE;
    v_error_message := SQLERRM;

    begin
      insert into public.period_write_through_failures as failure (
        regnr,
        source_entity,
        source_record_id,
        target_state,
        error_code,
        error_message
      ) values (
        coalesce(nullif(v_regnr, ''), 'UNKNOWN'),
        'nybil_inventering',
        coalesce(nullif(v_source_record_id, ''), 'UNKNOWN'),
        v_target_state,
        v_error_code,
        pg_catalog.left(v_error_message, 2000)
      )
      on conflict (source_entity, source_record_id)
      do update set
        target_state = excluded.target_state,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        attempts = failure.attempts + 1,
        last_failed_at = pg_catalog.now(),
        resolved_at = null;
    exception when others then
      raise warning '[period-write-through] Could not persist Nybil failure %.%: %',
        'nybil_inventering',
        v_source_record_id,
        SQLERRM;
    end;

    raise warning '[period-write-through] Nybil %.% failed [%]: %',
      'nybil_inventering',
      v_source_record_id,
      v_error_code,
      v_error_message;

    return false;
  end;
end;
$$;

create or replace function public.write_through_nybil_period()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.try_write_through_nybil_period(
    new.id,
    new.regnr,
    new.klar_for_uthyrning,
    new.created_at,
    new.registrerad_av,
    new.is_duplicate
  );

  return new;
exception when others then
  raise warning '[period-write-through] Nybil statement adapter failed: %', SQLERRM;
  return new;
end;
$$;

drop trigger if exists nybil_period_write_through on public.nybil_inventering;
create trigger nybil_period_write_through
after insert on public.nybil_inventering
for each row execute function public.write_through_nybil_period();

revoke all on function public.try_write_through_nybil_period(uuid, text, boolean, timestamptz, text, boolean)
  from public, anon, authenticated;
revoke all on function public.write_through_nybil_period()
  from public, anon, authenticated;

grant execute on function public.try_write_through_nybil_period(uuid, text, boolean, timestamptz, text, boolean)
  to service_role;
grant execute on function public.write_through_nybil_period()
  to service_role;

commit;
