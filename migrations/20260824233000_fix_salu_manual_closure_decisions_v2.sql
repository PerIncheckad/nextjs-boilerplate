begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- L2.8 Production acceptance repair.
-- The source-owned SALU closure decisions are:
-- SÄLJAS, PLANERA VERKSTAD, LÅNGTID PLANERA SKIFTE, ANNAT, FÖRLÄNGA.
-- Keep the four-argument v1 callable for compatible decisions, but require v2
-- for FÖRLÄNGA because that decision must carry a new saludatum.

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
begin
  if p_closure_outcome = 'FÖRLÄNGA' then
    raise exception 'FÖRLÄNGA requires close_salu_flag_manually_v2 with new saludatum' using errcode='22023';
  end if;

  return public.close_salu_flag_manually_v2(
    p_flag_id,
    p_closure_outcome,
    p_closure_comment,
    null,
    p_actor_id
  );
end;
$$;

create or replace function public.close_salu_flag_manually_v2(
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
  v_state public.salu_vehicle_state%rowtype;
  v_passage jsonb;
  v_checkpoint_snapshot jsonb := '[]'::jsonb;
  v_child_snapshot jsonb := '[]'::jsonb;
  v_old_saludatum date;
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

  if p_closure_outcome = 'ANNAT'
     and length(trim(coalesce(p_closure_comment,''))) = 0 then
    raise exception 'ANNAT requires a closure comment' using errcode='22023';
  end if;

  if p_closure_outcome = 'FÖRLÄNGA' and p_new_saludatum is null then
    raise exception 'FÖRLÄNGA requires a new saludatum' using errcode='22023';
  end if;

  if p_closure_outcome <> 'FÖRLÄNGA' and p_new_saludatum is not null then
    raise exception 'New saludatum is only valid for FÖRLÄNGA' using errcode='22023';
  end if;

  select * into v_flag
  from public.salu_flags
  where flag_id = p_flag_id
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

  select * into v_state
  from public.salu_vehicle_state
  where regnr = v_flag.regnr
  for update;

  if not found then
    raise exception 'SALU vehicle state not found' using errcode='P0002';
  end if;

  if p_closure_outcome = 'FÖRLÄNGA' then
    if p_new_saludatum < v_state.ny_date then
      raise exception 'SALU date cannot be before NY date' using errcode='22023';
    end if;

    v_old_saludatum := v_state.current_saludatum;

    update public.salu_vehicle_state
    set current_saludatum = p_new_saludatum,
        updated_by = p_actor_id,
        updated_at = pg_catalog.now()
    where regnr = v_flag.regnr;

    update public.salu_flags
    set current_saludatum = p_new_saludatum
    where flag_id = p_flag_id
    returning * into v_flag;

    insert into public.salu_events(
      regnr,flag_id,event_type,actor_id,actor_source,payload
    ) values (
      v_flag.regnr,v_flag.flag_id,'SALU_SALUDATUM_CHANGED',p_actor_id,'MANUELL',
      pg_catalog.jsonb_build_object(
        'old_saludatum',v_old_saludatum,
        'new_saludatum',p_new_saludatum,
        'source','SALU_CLOSURE_DECISION',
        'decision','FÖRLÄNGA'
      )
    );
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
  where sc.flag_id = p_flag_id;

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
  where cp.flag_id = p_flag_id;

  update public.salu_flags
  set status = 'STÄNGD',
      closed_at = pg_catalog.now(),
      closed_by = p_actor_id,
      closure_outcome = p_closure_outcome,
      closure_comment = nullif(trim(coalesce(p_closure_comment,'')),'')
  where flag_id = p_flag_id
  returning * into v_flag;

  update public.salu_vehicle_state
  set final_closed_at = v_flag.closed_at,
      updated_by = p_actor_id,
      updated_at = pg_catalog.now()
  where regnr = v_flag.regnr;

  insert into public.salu_events(
    regnr,flag_id,event_type,event_key,actor_id,actor_source,payload
  ) values (
    v_flag.regnr,v_flag.flag_id,'SALU_FLAG_CLOSED_MANUALLY',
    'salu-manual-close:' || v_flag.flag_id::text,p_actor_id,'MANUELL',
    pg_catalog.jsonb_build_object(
      'closureOutcome',v_flag.closure_outcome,
      'closureComment',v_flag.closure_comment,
      'newSaludatum',p_new_saludatum,
      'checkpointSnapshot',v_checkpoint_snapshot,
      'childProcessSnapshot',v_child_snapshot,
      'passage',v_passage
    )
  ) on conflict(event_key) do nothing;

  return to_jsonb(v_flag) || pg_catalog.jsonb_build_object(
    'new_saludatum',p_new_saludatum,
    'checkpoint_snapshot',v_checkpoint_snapshot,
    'child_process_snapshot',v_child_snapshot
  );
end;
$$;

revoke all on function public.close_salu_flag_manually_v1(uuid,text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.close_salu_flag_manually_v2(uuid,text,text,date,uuid)
  from public, anon, authenticated;

grant execute on function public.close_salu_flag_manually_v1(uuid,text,text,uuid)
  to service_role;
grant execute on function public.close_salu_flag_manually_v2(uuid,text,text,date,uuid)
  to service_role;

commit;
