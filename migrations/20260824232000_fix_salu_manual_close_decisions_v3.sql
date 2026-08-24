begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- L2.8 acceptance repair #2.
-- The persisted salu_flags contract uses the current manual owner decisions:
-- SALJAS / PLANERA VERKSTAD / LANGTID PLANERA SKIFTE / ANNAT / FORLANGA.
-- The previous acceptance migration accidentally used an older three-outcome
-- vocabulary and therefore made every valid manual close fail the table check.
-- FORLANGA is a plan change, not a close: the active flag must remain open and
-- its saludatum is changed through the existing SALU plan path.

create or replace function public.close_salu_flag_manually_v1(
  p_flag_id uuid,
  p_closure_outcome text,
  p_closure_comment text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_flag public.salu_flags%rowtype;
  v_passage jsonb;
  v_deviation_count integer := 0;
  v_checkpoint_snapshot jsonb := '[]'::jsonb;
  v_child_snapshot jsonb := '[]'::jsonb;
begin
  if p_actor_id is null then
    raise exception 'Manual SALU closure requires actor' using errcode='22023';
  end if;

  if p_closure_outcome not in (
    'SÄLJAS',
    'PLANERA VERKSTAD',
    'LÅNGTID PLANERA SKIFTE',
    'ANNAT',
    'FÖRLÄNGA'
  ) then
    raise exception 'Invalid SALU closure outcome' using errcode='22023';
  end if;

  if p_closure_outcome = 'FÖRLÄNGA' then
    raise exception 'FÖRLÄNGA changes the active SALU plan and must not close the flag' using errcode='P0001';
  end if;

  if p_closure_outcome = 'ANNAT'
     and length(trim(coalesce(p_closure_comment,''))) = 0 then
    raise exception 'ANNAT requires a closure comment' using errcode='22023';
  end if;

  select * into v_flag
  from public.salu_flags
  where flag_id=p_flag_id
  for update;

  if not found then
    raise exception 'SALU flag not found' using errcode='P0002';
  end if;

  if v_flag.status <> 'SLUTBEDÖMNING' then
    raise exception 'Manual closure requires SLUTBEDÖMNING' using errcode='P0001';
  end if;

  v_passage := public.assert_routine_passage_ready(
    'SALU_FINAL_ASSESSMENT',
    v_flag.regnr,
    null,
    pg_catalog.jsonb_build_object('flagId',v_flag.flag_id::text)
  );

  select count(*)::integer into v_deviation_count
  from public.salu_checkpoints
  where flag_id=p_flag_id
    and status='AVVIKELSE';

  -- The current database has no verified COO/CEO accepted-deviation
  -- authorization object yet. Never infer that authorization from a comment.
  -- Until that explicit contract exists, unresolved deviations cannot be
  -- silently converted into a completed close.
  if v_deviation_count > 0 then
    raise exception 'Remaining SALU deviations require explicit accepted-deviation authorization before closure'
      using errcode='P0001';
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'checkpointCode',sc.checkpoint_code,
      'status',sc.status,
      'evidenceRefs',sc.evidence_refs,
      'updatedAt',sc.updated_at
    ) order by sc.checkpoint_code
  ),'[]'::jsonb)
  into v_checkpoint_snapshot
  from public.salu_checkpoints sc
  where sc.flag_id=p_flag_id;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'childProcessId',cp.child_process_id,
      'processType',cp.process_type,
      'sourceCheckpoint',cp.source_checkpoint,
      'status',cp.status,
      'outcome',cp.outcome,
      'evidenceRefs',cp.evidence_refs,
      'verifiedAt',cp.verified_at
    ) order by cp.created_at,cp.child_process_id
  ),'[]'::jsonb)
  into v_child_snapshot
  from public.salu_child_processes cp
  where cp.flag_id=p_flag_id;

  update public.salu_flags
  set status='STÄNGD',
      closed_at=pg_catalog.now(),
      closed_by=p_actor_id,
      closure_outcome=p_closure_outcome,
      closure_comment=nullif(trim(coalesce(p_closure_comment,'')),'')
  where flag_id=p_flag_id
  returning * into v_flag;

  update public.salu_vehicle_state
  set final_closed_at=v_flag.closed_at,
      updated_by=p_actor_id,
      updated_at=pg_catalog.now()
  where regnr=v_flag.regnr;

  insert into public.salu_events(
    regnr,flag_id,event_type,event_key,actor_id,actor_source,payload
  ) values (
    v_flag.regnr,
    v_flag.flag_id,
    'SALU_FLAG_CLOSED_MANUALLY',
    'salu-manual-close:'||v_flag.flag_id::text,
    p_actor_id,
    'MANUELL',
    pg_catalog.jsonb_build_object(
      'closureOutcome',v_flag.closure_outcome,
      'closureComment',v_flag.closure_comment,
      'remainingDeviationCount',v_deviation_count,
      'checkpointSnapshot',v_checkpoint_snapshot,
      'childProcessSnapshot',v_child_snapshot,
      'passage',v_passage
    )
  ) on conflict(event_key) do nothing;

  return to_jsonb(v_flag) || pg_catalog.jsonb_build_object(
    'remaining_deviation_count',v_deviation_count,
    'checkpoint_snapshot',v_checkpoint_snapshot,
    'child_process_snapshot',v_child_snapshot
  );
end;
$$;

revoke all on function public.close_salu_flag_manually_v1(uuid,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.close_salu_flag_manually_v1(uuid,text,text,uuid)
  to service_role;

commit;
