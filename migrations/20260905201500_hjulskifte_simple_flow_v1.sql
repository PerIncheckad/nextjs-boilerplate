begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Normal operator flow is BEHÖVER SKIFTE -> BOKAD -> KLAR.
-- PAGAENDE remains a supported historical/compatibility status, but is no longer
-- required before an explicitly verified completion.
create or replace function public.update_garage_wheel_change(
  p_wheel_change_id uuid,
  p_status text,
  p_booked_for timestamptz,
  p_supplier text,
  p_location text,
  p_note text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_change public.garage_wheel_changes%rowtype;
  v_previous_status text;
  v_next_status text;
  v_event_type text := 'UPDATED';
  v_allowed boolean := false;
begin
  select * into v_change
  from public.garage_wheel_changes
  where wheel_change_id = p_wheel_change_id
  for update;

  if not found then
    raise exception 'Hjulskifte not found' using errcode = 'P0002';
  end if;

  if v_change.status = 'KLAR' then
    raise exception 'Ett verifierat hjulskifte är avslutat och kan inte ändras' using errcode = 'P0001';
  end if;

  v_previous_status := v_change.status;
  v_next_status := upper(trim(coalesce(p_status, v_change.status)));

  if v_next_status not in ('KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE') then
    raise exception 'Invalid wheel change status' using errcode = '22023';
  end if;

  v_allowed := case
    when v_change.status = 'KRAVS' and v_next_status in ('KRAVS', 'BOKAD', 'KLAR', 'PAGAENDE', 'AVVIKELSE') then true
    when v_change.status = 'BOKAD' and v_next_status in ('KRAVS', 'BOKAD', 'KLAR', 'PAGAENDE', 'AVVIKELSE') then true
    when v_change.status = 'PAGAENDE' and v_next_status in ('BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE') then true
    when v_change.status = 'AVVIKELSE' and v_next_status in ('KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE') then true
    else false
  end;

  if not v_allowed then
    raise exception 'Invalid wheel change transition % -> %', v_change.status, v_next_status using errcode = '22023';
  end if;

  if v_next_status = 'BOKAD' and p_booked_for is null then
    raise exception 'Bokad tid krävs när hjulskiftet är BOKAD' using errcode = '22023';
  end if;

  if v_next_status = 'AVVIKELSE' and length(trim(coalesce(p_note, v_change.note, ''))) = 0 then
    raise exception 'Avvikelse kräver kommentar' using errcode = '22023';
  end if;

  update public.garage_wheel_changes
  set status = v_next_status,
      booked_for = p_booked_for,
      supplier = nullif(trim(coalesce(p_supplier, '')), ''),
      location = nullif(trim(coalesce(p_location, '')), ''),
      note = nullif(trim(coalesce(p_note, '')), ''),
      completed_at = case when v_next_status = 'KLAR' then now() else null end,
      updated_by = p_actor_id,
      updated_by_email = p_actor_email,
      updated_at = now()
  where wheel_change_id = p_wheel_change_id
  returning * into v_change;

  update public.vehicle_checkpoints
  set due_at = case when v_next_status = 'BOKAD' then p_booked_for else due_at end,
      updated_by = p_actor_id,
      updated_at = now()
  where checkpoint_id = v_change.checkpoint_id;

  if v_next_status = 'AVVIKELSE' and v_previous_status <> 'AVVIKELSE' then
    perform public.assess_vehicle_checkpoint(
      v_change.checkpoint_id,
      'AVVIKELSE',
      coalesce(v_change.note, 'Hjulskifte avvikelse'),
      '[]'::jsonb,
      p_actor_id,
      p_actor_email,
      'MANUELL'
    );
  elsif v_next_status = 'KLAR' then
    perform public.assess_vehicle_checkpoint(
      v_change.checkpoint_id,
      'GODKAND',
      coalesce(v_change.note, 'Hjulskifte verifierat klart'),
      '[]'::jsonb,
      p_actor_id,
      p_actor_email,
      'MANUELL'
    );
  end if;

  if v_next_status = 'KLAR' then
    v_event_type := 'COMPLETED';
  elsif v_next_status <> v_previous_status then
    v_event_type := 'STATUS_CHANGED';
  end if;

  insert into public.garage_wheel_change_events (
    wheel_change_id, event_type, previous_status, status, snapshot, actor_id, actor_email
  ) values (
    v_change.wheel_change_id,
    v_event_type,
    v_previous_status,
    v_change.status,
    jsonb_build_object(
      'bookedFor', v_change.booked_for,
      'supplier', v_change.supplier,
      'location', v_change.location,
      'note', v_change.note,
      'completedAt', v_change.completed_at
    ),
    p_actor_id,
    p_actor_email
  );

  return to_jsonb(v_change);
end;
$$;

-- Atomic candidate action used by the simplified UI: create the checkpoint/work
-- object and book it in the same transaction. No intermediate operator action is
-- required and no PAGAENDE fact is invented.
create or replace function public.book_garage_wheel_change_for_vehicle(
  p_regnr text,
  p_season_key text,
  p_target_wheel_type text,
  p_booked_for timestamptz,
  p_supplier text,
  p_location text,
  p_note text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_created jsonb;
  v_wheel_change_id uuid;
begin
  if p_booked_for is null then
    raise exception 'Bokad tid krävs när hjulskiftet bokas' using errcode = '22023';
  end if;

  v_created := public.create_garage_wheel_change_for_vehicle(
    p_regnr,
    p_season_key,
    p_target_wheel_type,
    p_note,
    p_actor_id,
    p_actor_email
  );
  v_wheel_change_id := (v_created ->> 'wheel_change_id')::uuid;

  return public.update_garage_wheel_change(
    v_wheel_change_id,
    'BOKAD',
    p_booked_for,
    p_supplier,
    coalesce(nullif(trim(coalesce(p_location, '')), ''), v_created ->> 'location'),
    p_note,
    p_actor_id,
    p_actor_email
  );
end;
$$;

-- Explicit "redan utfört / klar" is also atomic. It records only what the
-- operator verifies: CREATED/KRAVS followed directly by COMPLETED/KLAR.
create or replace function public.complete_garage_wheel_change_for_vehicle(
  p_regnr text,
  p_season_key text,
  p_target_wheel_type text,
  p_supplier text,
  p_location text,
  p_note text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_created jsonb;
  v_wheel_change_id uuid;
begin
  v_created := public.create_garage_wheel_change_for_vehicle(
    p_regnr,
    p_season_key,
    p_target_wheel_type,
    p_note,
    p_actor_id,
    p_actor_email
  );
  v_wheel_change_id := (v_created ->> 'wheel_change_id')::uuid;

  return public.update_garage_wheel_change(
    v_wheel_change_id,
    'KLAR',
    null,
    p_supplier,
    coalesce(nullif(trim(coalesce(p_location, '')), ''), v_created ->> 'location'),
    p_note,
    p_actor_id,
    p_actor_email
  );
end;
$$;

revoke all on function public.book_garage_wheel_change_for_vehicle(text, text, text, timestamptz, text, text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_garage_wheel_change_for_vehicle(text, text, text, text, text, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.book_garage_wheel_change_for_vehicle(text, text, text, timestamptz, text, text, text, uuid, text)
  to service_role;
grant execute on function public.complete_garage_wheel_change_for_vehicle(text, text, text, text, text, text, uuid, text)
  to service_role;

commit;
