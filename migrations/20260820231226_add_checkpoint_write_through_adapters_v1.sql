begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Write-through must never make Nybil, Check-in or SALU unavailable. Failures
-- are durable and can be repaired by the existing source synchronization RPC.
create table public.checkpoint_write_through_failures (
  failure_id uuid primary key default gen_random_uuid(),
  regnr text not null check (length(trim(regnr)) > 0),
  checkpoint_code text not null check (length(trim(checkpoint_code)) > 0),
  cycle_key text not null check (length(trim(cycle_key)) > 0),
  source_entity text not null check (length(trim(source_entity)) > 0),
  source_record_id text not null check (length(trim(source_record_id)) > 0),
  error_code text,
  error_message text not null,
  attempts integer not null default 1 check (attempts > 0),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (regnr, checkpoint_code, cycle_key, source_entity, source_record_id)
);

create index checkpoint_write_through_failures_unresolved_idx
  on public.checkpoint_write_through_failures (last_failed_at, regnr)
  where resolved_at is null;

alter table public.checkpoint_write_through_failures enable row level security;
revoke all on public.checkpoint_write_through_failures from public, anon, authenticated;
grant select, insert, update, delete on public.checkpoint_write_through_failures to service_role;

-- Mark durable failures resolved whenever either write-through or the repair
-- synchronization reaches a GODKAND source checkpoint.
create or replace function public.resolve_checkpoint_write_through_failure()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status = 'GODKAND' then
    update public.checkpoint_write_through_failures
    set resolved_at = coalesce(resolved_at, pg_catalog.now())
    where regnr = new.regnr
      and checkpoint_code = new.checkpoint_code
      and cycle_key = new.cycle_key
      and source_entity = new.source_context ->> 'sourceEntity'
      and source_record_id = new.source_context ->> 'sourceRecordId'
      and resolved_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists checkpoint_write_through_failure_resolved_insert
  on public.vehicle_checkpoints;
create trigger checkpoint_write_through_failure_resolved_insert
after insert on public.vehicle_checkpoints
for each row execute function public.resolve_checkpoint_write_through_failure();

drop trigger if exists checkpoint_write_through_failure_resolved_update
  on public.vehicle_checkpoints;
create trigger checkpoint_write_through_failure_resolved_update
after update of status, source_context on public.vehicle_checkpoints
for each row execute function public.resolve_checkpoint_write_through_failure();

-- Safe wrapper around the strict source adapter. The source write remains the
-- authority; a checkpoint failure is logged instead of rolling back the source.
create or replace function public.try_record_verified_source_checkpoint(
  p_regnr text,
  p_checkpoint_code text,
  p_cycle_key text,
  p_occurred_at timestamptz,
  p_source_entity text,
  p_source_record_id text,
  p_source_journey_event_id uuid,
  p_source_context jsonb,
  p_actor_id uuid,
  p_actor_email text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text;
  v_checkpoint_code text;
  v_cycle_key text;
  v_source_entity text;
  v_source_record_id text;
  v_error_code text;
  v_error_message text;
begin
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  v_checkpoint_code := upper(trim(coalesce(p_checkpoint_code, '')));
  v_cycle_key := coalesce(nullif(trim(p_cycle_key), ''), 'default');
  v_source_entity := coalesce(nullif(trim(p_source_entity), ''), 'UNKNOWN');
  v_source_record_id := coalesce(nullif(trim(p_source_record_id), ''), 'UNKNOWN');

  begin
    perform public.record_verified_source_checkpoint(
      p_regnr,
      p_checkpoint_code,
      p_cycle_key,
      p_occurred_at,
      p_source_entity,
      p_source_record_id,
      p_source_journey_event_id,
      p_source_context,
      p_actor_id,
      p_actor_email
    );

    return true;
  exception when others then
    v_error_code := SQLSTATE;
    v_error_message := SQLERRM;

    begin
      insert into public.checkpoint_write_through_failures as failure (
        regnr,
        checkpoint_code,
        cycle_key,
        source_entity,
        source_record_id,
        error_code,
        error_message
      ) values (
        coalesce(nullif(v_regnr, ''), 'UNKNOWN'),
        coalesce(nullif(v_checkpoint_code, ''), 'UNKNOWN'),
        v_cycle_key,
        v_source_entity,
        v_source_record_id,
        v_error_code,
        pg_catalog.left(v_error_message, 2000)
      )
      on conflict (regnr, checkpoint_code, cycle_key, source_entity, source_record_id)
      do update set
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        attempts = failure.attempts + 1,
        last_failed_at = pg_catalog.now(),
        resolved_at = null;
    exception when others then
      raise warning '[checkpoint-write-through] Could not persist failure for %.%: %',
        v_source_entity,
        v_source_record_id,
        SQLERRM;
    end;

    raise warning '[checkpoint-write-through] %.% failed [%]: %',
      v_source_entity,
      v_source_record_id,
      v_error_code,
      v_error_message;

    return false;
  end;
end;
$$;

create or replace function public.write_through_nybil_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.try_record_verified_source_checkpoint(
    new.regnr,
    'NYBIL_BASELINE_CAPTURED',
    'nybil:' || new.id::text,
    coalesce(new.created_at, new.updated_at, pg_catalog.now()),
    'nybil_inventering',
    new.id::text,
    null,
    pg_catalog.jsonb_build_object(
      'sourceKind', 'NYBIL_BASELINE',
      'sourceStatus', 'RECORDED',
      'registeredBy', new.registrerad_av,
      'fullName', new.fullstandigt_namn
    ),
    auth.uid(),
    nullif(trim(new.registrerad_av), '')
  );

  return new;
end;
$$;

create or replace function public.write_through_checkin_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status <> 'COMPLETED' or new.completed_at is null then
    return new;
  end if;

  perform public.try_record_verified_source_checkpoint(
    new.regnr,
    'CHECKIN_COMPLETED',
    'checkin:' || new.id::text,
    new.completed_at,
    'checkins',
    new.id::text,
    null,
    pg_catalog.jsonb_build_object(
      'sourceKind', 'CHECKIN',
      'sourceStatus', 'COMPLETED',
      'completedBy', new.completed_by,
      'checkerName', new.checker_name,
      'checkerEmail', new.checker_email
    ),
    coalesce(new.completed_by, auth.uid()),
    nullif(trim(new.checker_email), '')
  );

  return new;
end;
$$;

create or replace function public.write_through_salu_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.try_record_verified_source_checkpoint(
    new.regnr,
    'SALU_CYCLE_CREATED',
    'salu:' || new.flag_id::text,
    coalesce(new.created_at, pg_catalog.now()),
    'salu_flags',
    new.flag_id::text,
    null,
    pg_catalog.jsonb_build_object(
      'sourceKind', 'SALU_CYCLE',
      'sourceStatus', new.status,
      'cycleSaludatum', new.cycle_saludatum,
      'currentSaludatum', new.current_saludatum,
      'ownerFunction', new.owner_function
    ),
    coalesce(new.created_by, auth.uid()),
    null
  );

  return new;
end;
$$;

drop trigger if exists nybil_checkpoint_write_through
  on public.nybil_inventering;
create trigger nybil_checkpoint_write_through
after insert or update on public.nybil_inventering
for each row execute function public.write_through_nybil_checkpoint();

drop trigger if exists checkin_checkpoint_write_through
  on public.checkins;
create trigger checkin_checkpoint_write_through
after insert or update on public.checkins
for each row
when (new.status = 'COMPLETED' and new.completed_at is not null)
execute function public.write_through_checkin_checkpoint();

drop trigger if exists salu_checkpoint_write_through
  on public.salu_flags;
create trigger salu_checkpoint_write_through
after insert on public.salu_flags
for each row execute function public.write_through_salu_checkpoint();

revoke all on function public.resolve_checkpoint_write_through_failure()
  from public, anon, authenticated;
revoke all on function public.try_record_verified_source_checkpoint(text, text, text, timestamptz, text, text, uuid, jsonb, uuid, text)
  from public, anon, authenticated;
revoke all on function public.write_through_nybil_checkpoint()
  from public, anon, authenticated;
revoke all on function public.write_through_checkin_checkpoint()
  from public, anon, authenticated;
revoke all on function public.write_through_salu_checkpoint()
  from public, anon, authenticated;

grant execute on function public.resolve_checkpoint_write_through_failure()
  to service_role;
grant execute on function public.try_record_verified_source_checkpoint(text, text, text, timestamptz, text, text, uuid, jsonb, uuid, text)
  to service_role;
grant execute on function public.write_through_nybil_checkpoint()
  to service_role;
grant execute on function public.write_through_checkin_checkpoint()
  to service_role;
grant execute on function public.write_through_salu_checkpoint()
  to service_role;

commit;
