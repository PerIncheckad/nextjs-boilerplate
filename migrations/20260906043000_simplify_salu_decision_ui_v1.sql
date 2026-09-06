begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- SALU UI/PROCESS-FÖRENKLING v1
--
-- Purpose: remove operator-only transition clicks without changing SALU truth,
-- readiness, history or downstream ownership.
--
-- Existing source-owned functions remain authoritative:
--   acknowledge_salu_flag_v1
--   move_salu_flag_to_final_assessment_v1
--   close_salu_flag_manually_v2
--
-- This wrapper only orchestrates those already verified transitions in ONE
-- database transaction. It does not bypass readiness and does not touch Garage,
-- AVVECKLA, Status, Rental or historical rows.

create or replace function public.decide_salu_flag_v1(
  p_flag_id uuid,
  p_closure_outcome text,
  p_closure_comment text,
  p_new_saludatum date,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_flag public.salu_flags%rowtype;
  v_result jsonb;
begin
  if p_flag_id is null then
    raise exception 'SALU flag krävs' using errcode = '22023';
  end if;

  if p_actor_id is null then
    raise exception 'Verifierad aktör krävs' using errcode = '22023';
  end if;

  -- Serialize one operator decision against the exact SALU cycle.
  select * into v_flag
  from public.salu_flags
  where flag_id = p_flag_id
  for update;

  if not found then
    raise exception 'SALU flag not found' using errcode = 'P0002';
  end if;

  if v_flag.status = 'STÄNGD' then
    raise exception 'Closed SALU flag cannot be decided again' using errcode = 'P0001';
  end if;

  -- NY -> HANDLÄGGS is still audited, but no longer requires a separate UI click.
  if v_flag.status = 'NY' then
    perform public.acknowledge_salu_flag_v1(p_flag_id, p_actor_id);

    select * into v_flag
    from public.salu_flags
    where flag_id = p_flag_id;
  end if;

  -- Readiness remains mandatory. The existing function records the historical
  -- SLUTBEDÖMNING transition and refuses unresolved blockers.
  if v_flag.status in ('HANDLÄGGS', 'VÄNTAR') then
    perform public.move_salu_flag_to_final_assessment_v1(p_flag_id, p_actor_id);

    select * into v_flag
    from public.salu_flags
    where flag_id = p_flag_id;
  end if;

  if v_flag.status <> 'SLUTBEDÖMNING' then
    raise exception 'SALU decision requires a ready cycle' using errcode = 'P0001';
  end if;

  -- Existing closure v2 remains the single owner of final decision validation,
  -- Saludatum change, snapshots, closure history and STÄNGD.
  v_result := public.close_salu_flag_manually_v2(
    p_flag_id,
    p_closure_outcome,
    p_closure_comment,
    p_new_saludatum,
    p_actor_id
  );

  return v_result || pg_catalog.jsonb_build_object(
    'operatorFlow', 'ONE_ACTION_DECISION',
    'readinessEnforced', true
  );
end;
$$;

revoke all on function public.decide_salu_flag_v1(uuid,text,text,date,uuid)
  from public, anon, authenticated;
grant execute on function public.decide_salu_flag_v1(uuid,text,text,date,uuid)
  to service_role;

comment on function public.decide_salu_flag_v1(uuid,text,text,date,uuid) is
  'SALU UI simplification: one operator decision call that preserves existing acknowledgement, readiness, final-assessment and closure semantics atomically.';

commit;
