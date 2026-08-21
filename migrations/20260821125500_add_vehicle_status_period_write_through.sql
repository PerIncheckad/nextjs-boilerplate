begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Explicit rental-readiness edits are the first authoritative operational
-- source connected to the journey time layer. This does NOT infer rentals.
-- Ja  => AVAILABLE
-- Nej => DOWNTIME with the user-entered free-text reason stored as OTHER.
--
-- Source writes remain authoritative: period write-through failures are
-- durable and never roll back vehicle_edits.
create table public.period_write_through_failures (
  failure_id uuid primary key default gen_random_uuid(),
  regnr text not null check (length(trim(regnr)) > 0),
  source_entity text not null check (length(trim(source_entity)) > 0),
  source_record_id text not null check (length(trim(source_record_id)) > 0),
  target_state text,
  error_code text,
  error_message text not null,
  attempts integer not null default 1 check (attempts > 0),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (source_entity, source_record_id)
);

create index period_write_through_failures_unresolved_idx
  on public.period_write_through_failures (last_failed_at, regnr)
  where resolved_at is null;

alter table public.period_write_through_failures enable row level security;
revoke all on public.period_write_through_failures from public, anon, authenticated;
grant select, insert, update, delete on public.period_write_through_failures to service_role;

-- One source edit must never create more than one primary period, including
-- when a failed write-through is replayed later.
create unique index if not exists vehicle_journey_periods_vehicle_edit_source_uidx
  on public.vehicle_journey_periods (source_record_id)
  where source_system = 'STATUS'
    and source_entity = 'vehicle_edits'
    and source_record_id is not null;

create or replace function public.try_write_through_vehicle_status_period(
  p_edit_id bigint,
  p_regnr text,
  p_new_value text,
  p_old_value text,
  p_edited_at timestamptz,
  p_edited_by text,
  p_batch_id text,
  p_reason_text text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text;
  v_new_value text;
  v_old_value text;
  v_target_state text;
  v_reason_code text;
  v_reason_text text;
  v_source_record_id text;
  v_error_code text;
  v_error_message text;
begin
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  v_new_value := lower(trim(coalesce(p_new_value, '')));
  v_old_value := lower(trim(coalesce(p_old_value, '')));
  v_source_record_id := p_edit_id::text;

  if v_regnr = '' or p_edit_id is null then
    return false;
  end if;

  if v_new_value not in ('ja', 'nej') then
    return true;
  end if;

  -- Re-saving the same semantic value is not a state transition.
  if v_old_value = v_new_value then
    return true;
  end if;

  v_target_state := case when v_new_value = 'ja' then 'AVAILABLE' else 'DOWNTIME' end;
  v_reason_code := case when v_target_state = 'DOWNTIME' then 'OTHER' else null end;
  v_reason_text := nullif(trim(coalesce(p_reason_text, '')), '');

  begin
    -- Idempotency across trigger execution and explicit repair/replay.
    if exists (
      select 1
      from public.vehicle_journey_periods
      where source_system = 'STATUS'
        and source_entity = 'vehicle_edits'
        and source_record_id = v_source_record_id
    ) then
      update public.period_write_through_failures
      set resolved_at = coalesce(resolved_at, pg_catalog.now())
      where source_entity = 'vehicle_edits'
        and source_record_id = v_source_record_id
        and resolved_at is null;
      return true;
    end if;

    if v_target_state = 'DOWNTIME' and v_reason_text is null then
      raise exception 'Ej uthyrningsbar requires an explicit reason before DOWNTIME can be established'
        using errcode = '22023';
    end if;

    perform public.transition_vehicle_journey_state(
      gen_random_uuid(),
      v_regnr,
      v_target_state,
      coalesce(p_edited_at, pg_catalog.now()),
      v_reason_code,
      v_reason_text,
      'STATUS',
      'vehicle_edits',
      v_source_record_id,
      null,
      'MANUELL',
      nullif(trim(coalesce(p_edited_by, '')), ''),
      pg_catalog.jsonb_build_object(
        'sourceKind', 'RENTAL_READINESS',
        'sourceField', 'klar_for_uthyrning',
        'oldValue', p_old_value,
        'newValue', p_new_value,
        'batchId', p_batch_id
      )
    );

    update public.period_write_through_failures
    set resolved_at = coalesce(resolved_at, pg_catalog.now())
    where source_entity = 'vehicle_edits'
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
        'vehicle_edits',
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
      raise warning '[period-write-through] Could not persist failure for vehicle_edits.%: %',
        v_source_record_id,
        SQLERRM;
    end;

    raise warning '[period-write-through] vehicle_edits.% failed [%]: %',
      v_source_record_id,
      v_error_code,
      v_error_message;

    return false;
  end;
end;
$$;

-- Statement-level trigger is deliberate: the status action writes
-- klar_for_uthyrning and its reason in the same batch. A transition table lets
-- us read both rows without racing the row insertion order.
create or replace function public.write_through_vehicle_status_periods()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_edit record;
  v_reason_text text;
begin
  for v_edit in
    select
      id,
      regnr,
      new_value,
      old_value,
      edited_by,
      edited_at,
      batch_id
    from inserted_vehicle_edits
    where field_name = 'klar_for_uthyrning'
      and lower(trim(coalesce(new_value, ''))) in ('ja', 'nej')
    order by id
  loop
    v_reason_text := null;

    if lower(trim(coalesce(v_edit.new_value, ''))) = 'nej' then
      select nullif(trim(reason_edit.new_value), '')
      into v_reason_text
      from inserted_vehicle_edits reason_edit
      where reason_edit.regnr = v_edit.regnr
        and reason_edit.field_name = 'ej_uthyrningsbar_anledning'
        and reason_edit.batch_id is not distinct from v_edit.batch_id
      order by reason_edit.id desc
      limit 1;
    end if;

    perform public.try_write_through_vehicle_status_period(
      v_edit.id,
      v_edit.regnr,
      v_edit.new_value,
      v_edit.old_value,
      v_edit.edited_at,
      v_edit.edited_by,
      v_edit.batch_id,
      v_reason_text
    );
  end loop;

  return null;
exception when others then
  -- Absolute fail-open boundary. A programming/runtime problem in the adapter
  -- must never make the authoritative vehicle_edits insert fail.
  raise warning '[period-write-through] statement adapter failed: %', SQLERRM;
  return null;
end;
$$;

drop trigger if exists vehicle_status_period_write_through on public.vehicle_edits;
create trigger vehicle_status_period_write_through
after insert on public.vehicle_edits
referencing new table as inserted_vehicle_edits
for each statement
execute function public.write_through_vehicle_status_periods();

-- Explicit replay path for one failed source edit. This is intentionally not a
-- historical backfill function: it only replays an edit id chosen by the server.
create or replace function public.replay_vehicle_status_period_write_through(
  p_edit_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_edit public.vehicle_edits%rowtype;
  v_reason_text text;
begin
  select *
  into v_edit
  from public.vehicle_edits
  where id = p_edit_id
    and field_name = 'klar_for_uthyrning';

  if not found then
    raise exception 'Vehicle status edit not found' using errcode = 'P0002';
  end if;

  if lower(trim(coalesce(v_edit.new_value, ''))) = 'nej' then
    select nullif(trim(reason_edit.new_value), '')
    into v_reason_text
    from public.vehicle_edits reason_edit
    where reason_edit.regnr = v_edit.regnr
      and reason_edit.field_name = 'ej_uthyrningsbar_anledning'
      and reason_edit.batch_id is not distinct from v_edit.batch_id
    order by reason_edit.id desc
    limit 1;
  end if;

  return public.try_write_through_vehicle_status_period(
    v_edit.id,
    v_edit.regnr,
    v_edit.new_value,
    v_edit.old_value,
    v_edit.edited_at,
    v_edit.edited_by,
    v_edit.batch_id,
    v_reason_text
  );
end;
$$;

revoke all on function public.try_write_through_vehicle_status_period(bigint, text, text, text, timestamptz, text, text, text)
  from public, anon, authenticated;
revoke all on function public.write_through_vehicle_status_periods()
  from public, anon, authenticated;
revoke all on function public.replay_vehicle_status_period_write_through(bigint)
  from public, anon, authenticated;

grant execute on function public.try_write_through_vehicle_status_period(bigint, text, text, text, timestamptz, text, text, text)
  to service_role;
grant execute on function public.write_through_vehicle_status_periods()
  to service_role;
grant execute on function public.replay_vehicle_status_period_write_through(bigint)
  to service_role;

commit;
