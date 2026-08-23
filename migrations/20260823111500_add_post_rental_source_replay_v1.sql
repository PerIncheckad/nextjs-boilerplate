begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Check-in already has a fail-open write-through function but no explicit
-- server replay wrapper. Add one so a Check-in that happened after H / InDt,
-- but arrived while RENTAL was still open in Incheckad, can be retried later.
create or replace function public.replay_checkin_downtime_period_write_through(
  p_checkin_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_checkin public.checkins%rowtype;
  v_ok boolean;
begin
  select *
  into v_checkin
  from public.checkins
  where id = p_checkin_id;

  if not found then
    raise exception 'Check-in not found for replay' using errcode = 'P0002';
  end if;

  v_ok := public.try_write_through_checkin_downtime_period(
    v_checkin.id,
    v_checkin.regnr,
    v_checkin.status,
    v_checkin.completed_at,
    v_checkin.checklist,
    v_checkin.completed_by,
    v_checkin.checker_email
  );

  if v_ok then
    update public.period_write_through_failures
    set resolved_at = coalesce(resolved_at, pg_catalog.now())
    where source_entity = 'checkins'
      and source_record_id = v_checkin.id::text
      and resolved_at is null;
  end if;

  return v_ok;
end;
$$;

-- Replay only facts that actually occurred AFTER the rental return time. Facts
-- from before H remain unresolved because H proves the vehicle was still in the
-- RENTAL interval then. Exact timestamp ties across multiple sources are also
-- left unresolved: source precedence must never be invented.
create or replace function public.replay_deferred_vehicle_state_after_rental(
  p_regnr text,
  p_returned_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text;
  v_candidate record;
  v_ok boolean;
  v_replayed integer := 0;
  v_failed integer := 0;
  v_ambiguous integer := 0;
begin
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));

  if v_regnr = '' or p_returned_at is null then
    raise exception 'Vehicle and H / InDt are required for deferred replay'
      using errcode = '22023';
  end if;

  for v_candidate in
    with candidates as (
      select
        failure.source_entity,
        failure.source_record_id,
        edit.edited_at as occurred_at,
        edit.id::text as source_id
      from public.period_write_through_failures failure
      join public.vehicle_edits edit
        on failure.source_entity = 'vehicle_edits'
       and failure.source_record_id = edit.id::text
      where failure.regnr = v_regnr
        and failure.resolved_at is null
        and edit.field_name = 'klar_for_uthyrning'
        and edit.edited_at > p_returned_at

      union all

      select
        failure.source_entity,
        failure.source_record_id,
        checkin.completed_at as occurred_at,
        checkin.id::text as source_id
      from public.period_write_through_failures failure
      join public.checkins checkin
        on failure.source_entity = 'checkins'
       and failure.source_record_id = checkin.id::text
      where failure.regnr = v_regnr
        and failure.resolved_at is null
        and checkin.status = 'COMPLETED'
        and checkin.completed_at > p_returned_at
    ), ranked as (
      select
        candidates.*,
        count(*) over (partition by occurred_at) as same_timestamp_count
      from candidates
    )
    select *
    from ranked
    order by occurred_at, source_entity, source_record_id
  loop
    if v_candidate.same_timestamp_count > 1 then
      v_ambiguous := v_ambiguous + 1;
      continue;
    end if;

    begin
      if v_candidate.source_entity = 'vehicle_edits' then
        v_ok := public.replay_vehicle_status_period_write_through(v_candidate.source_id::bigint);
      elsif v_candidate.source_entity = 'checkins' then
        v_ok := public.replay_checkin_downtime_period_write_through(v_candidate.source_id::uuid);
      else
        v_ok := false;
      end if;

      if v_ok then
        v_replayed := v_replayed + 1;
      else
        v_failed := v_failed + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning '[post-rental-replay] %.% failed: %',
        v_candidate.source_entity, v_candidate.source_record_id, SQLERRM;
    end;
  end loop;

  return pg_catalog.jsonb_build_object(
    'regnr', v_regnr,
    'returnedAt', p_returned_at,
    'replayed', v_replayed,
    'failed', v_failed,
    'ambiguous', v_ambiguous
  );
end;
$$;

-- H is committed first. Only after the source-owned RENTAL period has actually
-- closed do we retry later verified source facts. Replay failure is fail-open:
-- it must never roll back the authoritative H / InDt fact.
create or replace function public.replay_deferred_vehicle_state_after_rental_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.replay_deferred_vehicle_state_after_rental(new.regnr, new.ended_at);
  return new;
exception when others then
  raise warning '[post-rental-replay] Trigger failed for % at %: %',
    new.regnr, new.ended_at, SQLERRM;
  return new;
end;
$$;

drop trigger if exists rental_period_post_return_replay on public.vehicle_journey_periods;
create trigger rental_period_post_return_replay
after update of ended_at on public.vehicle_journey_periods
for each row
when (
  old.period_type = 'RENTAL'
  and old.ended_at is null
  and new.ended_at is not null
  and new.source_entity = 'rental_operational_facts'
)
execute function public.replay_deferred_vehicle_state_after_rental_trigger();

revoke all on function public.replay_checkin_downtime_period_write_through(uuid)
  from public, anon, authenticated;
revoke all on function public.replay_deferred_vehicle_state_after_rental(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.replay_deferred_vehicle_state_after_rental_trigger()
  from public, anon, authenticated;

grant execute on function public.replay_checkin_downtime_period_write_through(uuid)
  to service_role;
grant execute on function public.replay_deferred_vehicle_state_after_rental(text, timestamptz)
  to service_role;
grant execute on function public.replay_deferred_vehicle_state_after_rental_trigger()
  to service_role;

commit;
