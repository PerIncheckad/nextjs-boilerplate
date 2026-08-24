begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- L2.8 repair discovered by Production acceptance dry-run.
-- SALU_FINAL_ASSESSMENT v1 incorrectly treated the generic PLANERING/INKOP
-- handoffs as the readiness gate. The SALU source contract instead requires:
--   1) no SALU checkpoint in VANTAR;
--   2) every SALU child process terminal (VERIFIED/CANCELLED).
-- Handoffs remain valid workflow objects, but they are not unconditional SALU
-- final-assessment requirements.

alter table public.passage_requirements
  drop constraint if exists passage_requirements_requirement_type_check;

alter table public.passage_requirements
  add constraint passage_requirements_requirement_type_check
  check (requirement_type in (
    'HANDOFF',
    'CHECKPOINT',
    'SALU_CHECKPOINT_SET',
    'SALU_CHILD_PROCESS_SET'
  ));

create or replace function public.evaluate_routine_passage(
  p_passage_code text,
  p_regnr text,
  p_cycle_key text default null,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_definition public.passage_definitions%rowtype;
  v_requirement record;
  v_status text;
  v_found boolean;
  v_ready boolean := true;
  v_reasons jsonb := '[]'::jsonb;
  v_requirements jsonb := '[]'::jsonb;
  v_flag_id_text text := nullif(p_context ->> 'flagId', '');
  v_flag_id uuid;
  v_flag_context_valid boolean := false;
  v_count integer := 0;
begin
  if pg_catalog.jsonb_typeof(coalesce(p_context, '{}'::jsonb)) <> 'object' then
    raise exception 'Passage context must be an object' using errcode = '22023';
  end if;

  select * into v_definition
  from public.passage_definitions
  where passage_code = upper(trim(p_passage_code))
    and active
  order by passage_version desc
  limit 1;

  if not found then
    raise exception 'Active passage definition not found' using errcode = 'P0002';
  end if;

  if v_flag_id_text is not null then
    begin
      v_flag_id := v_flag_id_text::uuid;
    exception when invalid_text_representation then
      v_flag_id := null;
    end;

    if v_flag_id is not null then
      select exists (
        select 1
        from public.salu_flags sf
        where sf.flag_id = v_flag_id
          and sf.regnr = upper(trim(p_regnr))
      ) into v_flag_context_valid;
    end if;
  end if;

  for v_requirement in
    select *
    from public.passage_requirements
    where passage_code = v_definition.passage_code
      and passage_version = v_definition.passage_version
      and active
    order by sequence_order, requirement_code
  loop
    v_status := null;
    v_found := false;
    v_count := 0;

    if v_requirement.requirement_type = 'HANDOFF' then
      select h.status, true
        into v_status, v_found
      from public.handoffs h
      where h.regnr = upper(trim(p_regnr))
        and h.handoff_code = v_requirement.reference_code
        and h.handoff_version = v_requirement.reference_version
        and (v_flag_id_text is null or h.metadata ->> 'flagId' = v_flag_id_text)
      order by h.created_at desc
      limit 1;

      if not coalesce(v_found, false) then
        v_ready := false;
        v_reasons := v_reasons || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'HANDOFF_MISSING',
            'requirementCode', v_requirement.requirement_code,
            'referenceCode', v_requirement.reference_code
          )
        );
      elsif v_status not in ('VERIFIED','CANCELLED') then
        v_ready := false;
        v_reasons := v_reasons || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'HANDOFF_UNRESOLVED',
            'requirementCode', v_requirement.requirement_code,
            'referenceCode', v_requirement.reference_code,
            'status', v_status
          )
        );
      end if;

    elsif v_requirement.requirement_type = 'CHECKPOINT' then
      select vc.status, true
        into v_status, v_found
      from public.vehicle_checkpoints vc
      where vc.regnr = upper(trim(p_regnr))
        and vc.checkpoint_code = v_requirement.reference_code
        and vc.definition_version = v_requirement.reference_version
        and (p_cycle_key is null or vc.cycle_key = p_cycle_key)
      order by vc.created_at desc
      limit 1;

      if not coalesce(v_found, false) then
        v_ready := false;
        v_reasons := v_reasons || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'CHECKPOINT_MISSING',
            'requirementCode', v_requirement.requirement_code,
            'referenceCode', v_requirement.reference_code
          )
        );
      elsif v_status not in ('GODKAND','EJ_RELEVANT') then
        v_ready := false;
        v_reasons := v_reasons || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'CHECKPOINT_UNRESOLVED',
            'requirementCode', v_requirement.requirement_code,
            'referenceCode', v_requirement.reference_code,
            'status', v_status
          )
        );
      end if;

    elsif v_requirement.requirement_type = 'SALU_CHECKPOINT_SET' then
      if not v_flag_context_valid then
        v_ready := false;
        v_reasons := v_reasons || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'SALU_FLAG_CONTEXT_MISSING_OR_INVALID',
            'requirementCode', v_requirement.requirement_code
          )
        );
      else
        v_found := true;
        select count(*)::integer into v_count
        from public.salu_checkpoints sc
        where sc.flag_id = v_flag_id
          and sc.status = 'VÄNTAR';

        v_status := case when v_count = 0 then 'READY' else 'VÄNTAR' end;
        if v_count > 0 then
          v_ready := false;
          v_reasons := v_reasons || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'code', 'SALU_CHECKPOINTS_WAITING',
              'requirementCode', v_requirement.requirement_code,
              'waitingCount', v_count
            )
          );
        end if;
      end if;

    elsif v_requirement.requirement_type = 'SALU_CHILD_PROCESS_SET' then
      if not v_flag_context_valid then
        v_ready := false;
        v_reasons := v_reasons || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'SALU_FLAG_CONTEXT_MISSING_OR_INVALID',
            'requirementCode', v_requirement.requirement_code
          )
        );
      else
        v_found := true;
        select count(*)::integer into v_count
        from public.salu_child_processes cp
        where cp.flag_id = v_flag_id
          and cp.status not in ('VERIFIED','CANCELLED');

        v_status := case when v_count = 0 then 'READY' else 'OPEN' end;
        if v_count > 0 then
          v_ready := false;
          v_reasons := v_reasons || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'code', 'SALU_CHILD_PROCESS_NOT_TERMINAL',
              'requirementCode', v_requirement.requirement_code,
              'openCount', v_count
            )
          );
        end if;
      end if;
    end if;

    v_requirements := v_requirements || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'requirementCode', v_requirement.requirement_code,
        'type', v_requirement.requirement_type,
        'referenceCode', v_requirement.reference_code,
        'referenceVersion', v_requirement.reference_version,
        'found', coalesce(v_found, false),
        'status', v_status
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'passageCode', v_definition.passage_code,
    'passageVersion', v_definition.passage_version,
    'routineCode', v_definition.routine_code,
    'targetState', v_definition.target_state,
    'regnr', upper(trim(p_regnr)),
    'ready', v_ready,
    'reasons', v_reasons,
    'requirements', v_requirements
  );
end;
$$;

-- Version the SALU gate instead of rewriting its historical definition.
update public.passage_definitions
set active = false,
    changed_at = pg_catalog.now()
where passage_code = 'SALU_FINAL_ASSESSMENT'
  and active;

insert into public.passage_definitions (
  passage_code, passage_version, routine_code, routine_version,
  title, description, target_state, active
) values (
  'SALU_FINAL_ASSESSMENT', 2, 'SALU_CYCLE', 1,
  'SALU till slutbedömning',
  'Readiness-gate enligt SALU-källkontraktet: ingen checkpoint VÄNTAR och alla barnprocesser terminala.',
  'SLUTBEDÖMNING', true
)
on conflict (passage_code, passage_version) do update
set active = excluded.active,
    description = excluded.description,
    changed_at = pg_catalog.now();

insert into public.passage_requirements (
  passage_code, passage_version, requirement_code, requirement_type,
  reference_code, reference_version, sequence_order, active
) values
  ('SALU_FINAL_ASSESSMENT', 2, 'SALU_CHECKPOINTS_RESOLVED', 'SALU_CHECKPOINT_SET', 'SALU_CHECKPOINTS', 1, 1, true),
  ('SALU_FINAL_ASSESSMENT', 2, 'SALU_CHILD_PROCESSES_TERMINAL', 'SALU_CHILD_PROCESS_SET', 'SALU_CHILD_PROCESSES', 1, 2, true)
on conflict (passage_code, passage_version, requirement_code) do update
set requirement_type = excluded.requirement_type,
    reference_code = excluded.reference_code,
    reference_version = excluded.reference_version,
    sequence_order = excluded.sequence_order,
    active = excluded.active;

create or replace function public.acknowledge_salu_flag_v1(
  p_flag_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_flag public.salu_flags%rowtype;
begin
  if p_actor_id is null then
    raise exception 'SALU acknowledgement requires actor' using errcode = '22023';
  end if;

  select * into v_flag
  from public.salu_flags
  where flag_id = p_flag_id
  for update;

  if not found then raise exception 'SALU flag not found' using errcode = 'P0002'; end if;
  if v_flag.status <> 'NY' then raise exception 'Only NY SALU flag can be acknowledged' using errcode = 'P0001'; end if;

  update public.salu_flags
  set status = 'HANDLÄGGS',
      acknowledged_at = pg_catalog.now(),
      acknowledged_by = p_actor_id
  where flag_id = p_flag_id
  returning * into v_flag;

  insert into public.salu_events (
    regnr, flag_id, event_type, actor_id, actor_source, payload
  ) values (
    v_flag.regnr, v_flag.flag_id, 'SALU_FLAG_ACKNOWLEDGED', p_actor_id, 'MANUELL',
    pg_catalog.jsonb_build_object('status', v_flag.status)
  );

  return to_jsonb(v_flag);
end;
$$;

create or replace function public.record_salu_checkpoint_status_v1(
  p_flag_id uuid,
  p_checkpoint_code text,
  p_status text,
  p_evidence_refs jsonb,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_flag public.salu_flags%rowtype;
  v_checkpoint public.salu_checkpoints%rowtype;
  v_previous_status text;
begin
  if p_actor_id is null then raise exception 'SALU checkpoint change requires actor' using errcode='22023'; end if;
  if upper(trim(p_checkpoint_code)) !~ '^S(0[0-9]|1[0-9]|2[0-8])$' then raise exception 'Invalid SALU checkpoint code' using errcode='22023'; end if;
  if p_status not in ('GODKÄND','AVVIKELSE','EJ RELEVANT','VÄNTAR') then raise exception 'Invalid SALU checkpoint status' using errcode='22023'; end if;
  if pg_catalog.jsonb_typeof(coalesce(p_evidence_refs,'[]'::jsonb)) <> 'array' then raise exception 'Evidence refs must be array' using errcode='22023'; end if;

  select * into v_flag from public.salu_flags where flag_id=p_flag_id;
  if not found then raise exception 'SALU flag not found' using errcode='P0002'; end if;
  if v_flag.status = 'STÄNGD' then raise exception 'Closed SALU flag cannot change checkpoint' using errcode='P0001'; end if;

  select * into v_checkpoint
  from public.salu_checkpoints
  where flag_id=p_flag_id and checkpoint_code=upper(trim(p_checkpoint_code))
  for update;

  if found then
    v_previous_status := v_checkpoint.status;
    update public.salu_checkpoints
    set status=p_status,
        evidence_refs=coalesce(p_evidence_refs,'[]'::jsonb),
        updated_by=p_actor_id,
        updated_at=pg_catalog.now()
    where checkpoint_id=v_checkpoint.checkpoint_id
    returning * into v_checkpoint;
  else
    v_previous_status := null;
    insert into public.salu_checkpoints(flag_id,checkpoint_code,status,evidence_refs,updated_by)
    values(p_flag_id,upper(trim(p_checkpoint_code)),p_status,coalesce(p_evidence_refs,'[]'::jsonb),p_actor_id)
    returning * into v_checkpoint;
  end if;

  insert into public.salu_events(regnr,flag_id,event_type,actor_id,actor_source,payload)
  values(
    v_flag.regnr,p_flag_id,'SALU_CHECKPOINT_CHANGED',p_actor_id,'MANUELL',
    pg_catalog.jsonb_build_object(
      'checkpointCode',v_checkpoint.checkpoint_code,
      'previousStatus',v_previous_status,
      'status',v_checkpoint.status,
      'evidenceRefs',v_checkpoint.evidence_refs
    )
  );

  return to_jsonb(v_checkpoint);
end;
$$;

create or replace function public.create_salu_child_process_v1(
  p_flag_id uuid,
  p_process_type text,
  p_source_checkpoint text,
  p_source_reason text,
  p_owner_ref text,
  p_execution_system text,
  p_deadline_at timestamptz,
  p_due_event text,
  p_blocking boolean,
  p_blocks_step text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_flag public.salu_flags%rowtype;
  v_child public.salu_child_processes%rowtype;
begin
  if p_actor_id is null then raise exception 'SALU child creation requires actor' using errcode='22023'; end if;
  if length(trim(coalesce(p_process_type,'')))=0 then raise exception 'Process type required' using errcode='22023'; end if;
  if length(trim(coalesce(p_owner_ref,'')))=0 then raise exception 'Owner required' using errcode='22023'; end if;
  if p_execution_system not in ('INCHECKAD','PLANNER','EXTERNAL') then raise exception 'Invalid execution system' using errcode='22023'; end if;
  if p_deadline_at is null and length(trim(coalesce(p_due_event,'')))=0 then raise exception 'Deadline or due event required' using errcode='22023'; end if;

  select * into v_flag from public.salu_flags where flag_id=p_flag_id;
  if not found then raise exception 'SALU flag not found' using errcode='P0002'; end if;
  if v_flag.status='STÄNGD' then raise exception 'Closed SALU flag cannot create child process' using errcode='P0001'; end if;

  insert into public.salu_child_processes(
    flag_id,process_type,source_checkpoint,source_reason,owner_ref,execution_system,
    deadline_at,due_event,status,status_actor,blocking,blocks_step,evidence_refs,created_by
  ) values (
    p_flag_id,trim(p_process_type),nullif(trim(coalesce(p_source_checkpoint,'')),''),
    nullif(trim(coalesce(p_source_reason,'')),''),trim(p_owner_ref),p_execution_system,
    p_deadline_at,nullif(trim(coalesce(p_due_event,'')),''),'CREATED',p_actor_id,
    coalesce(p_blocking,false),nullif(trim(coalesce(p_blocks_step,'')),''),'[]'::jsonb,p_actor_id
  ) returning * into v_child;

  insert into public.salu_events(regnr,flag_id,event_type,actor_id,actor_source,payload)
  values(
    v_flag.regnr,p_flag_id,'SALU_CHILD_PROCESS_CREATED',p_actor_id,'MANUELL',
    pg_catalog.jsonb_build_object(
      'childProcessId',v_child.child_process_id,
      'processType',v_child.process_type,
      'sourceCheckpoint',v_child.source_checkpoint,
      'ownerRef',v_child.owner_ref,
      'executionSystem',v_child.execution_system,
      'blocking',v_child.blocking,
      'blocksStep',v_child.blocks_step
    )
  );

  return to_jsonb(v_child);
end;
$$;

create or replace function public.transition_salu_child_process_v1(
  p_child_process_id uuid,
  p_next_status text,
  p_outcome text,
  p_comment text,
  p_evidence_refs jsonb,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_child public.salu_child_processes%rowtype;
  v_flag public.salu_flags%rowtype;
  v_previous_status text;
  v_allowed boolean := false;
begin
  if p_actor_id is null then raise exception 'SALU child transition requires actor' using errcode='22023'; end if;
  if p_next_status not in ('ACCEPTED','IN_PROGRESS','READY_FOR_VERIFICATION','VERIFIED','CANCELLED') then raise exception 'Invalid SALU child status' using errcode='22023'; end if;
  if pg_catalog.jsonb_typeof(coalesce(p_evidence_refs,'[]'::jsonb)) <> 'array' then raise exception 'Evidence refs must be array' using errcode='22023'; end if;

  select * into v_child from public.salu_child_processes where child_process_id=p_child_process_id for update;
  if not found then raise exception 'SALU child process not found' using errcode='P0002'; end if;
  v_previous_status := v_child.status;
  if v_previous_status in ('VERIFIED','CANCELLED') then raise exception 'Terminal SALU child cannot transition' using errcode='P0001'; end if;

  v_allowed := case
    when v_previous_status='CREATED' and p_next_status in ('ACCEPTED','CANCELLED') then true
    when v_previous_status='ACCEPTED' and p_next_status in ('IN_PROGRESS','CANCELLED') then true
    when v_previous_status='IN_PROGRESS' and p_next_status in ('READY_FOR_VERIFICATION','CANCELLED') then true
    when v_previous_status='READY_FOR_VERIFICATION' and p_next_status in ('VERIFIED','IN_PROGRESS','CANCELLED') then true
    else false
  end;
  if not v_allowed then raise exception 'Invalid SALU child transition % -> %',v_previous_status,p_next_status using errcode='P0001'; end if;
  if p_next_status='CANCELLED' and length(trim(coalesce(p_comment,'')))=0 then raise exception 'Cancellation requires reason' using errcode='22023'; end if;
  if p_next_status='READY_FOR_VERIFICATION' and length(trim(coalesce(p_outcome,'')))=0 then raise exception 'Ready for verification requires outcome' using errcode='22023'; end if;

  update public.salu_child_processes
  set status=p_next_status,
      status_timestamp=pg_catalog.now(),
      status_actor=p_actor_id,
      accepted_by=case when p_next_status='ACCEPTED' then p_actor_id else accepted_by end,
      accepted_at=case when p_next_status='ACCEPTED' then pg_catalog.now() else accepted_at end,
      outcome=case when p_next_status in ('READY_FOR_VERIFICATION','VERIFIED','CANCELLED') then coalesce(nullif(trim(coalesce(p_outcome,'')),''),outcome) else outcome end,
      evidence_refs=case when p_next_status in ('READY_FOR_VERIFICATION','VERIFIED') then coalesce(p_evidence_refs,evidence_refs) else evidence_refs end,
      verified_by=case when p_next_status='VERIFIED' then p_actor_id else verified_by end,
      verified_at=case when p_next_status='VERIFIED' then pg_catalog.now() else verified_at end,
      cancel_reason=case when p_next_status='CANCELLED' then trim(p_comment) else cancel_reason end
  where child_process_id=p_child_process_id
  returning * into v_child;

  select * into v_flag from public.salu_flags where flag_id=v_child.flag_id;

  insert into public.salu_events(regnr,flag_id,event_type,actor_id,actor_source,payload)
  values(
    v_flag.regnr,v_child.flag_id,'SALU_CHILD_STATUS_REPORTED',p_actor_id,'MANUELL',
    pg_catalog.jsonb_build_object(
      'childProcessId',v_child.child_process_id,
      'previousStatus',v_previous_status,
      'status',v_child.status,
      'outcome',v_child.outcome,
      'comment',nullif(trim(coalesce(p_comment,'')),''),
      'evidenceRefs',v_child.evidence_refs
    )
  );

  return to_jsonb(v_child);
end;
$$;

create or replace function public.move_salu_flag_to_final_assessment_v1(
  p_flag_id uuid,
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
begin
  if p_actor_id is null then raise exception 'Final assessment requires actor' using errcode='22023'; end if;

  select * into v_flag from public.salu_flags where flag_id=p_flag_id for update;
  if not found then raise exception 'SALU flag not found' using errcode='P0002'; end if;
  if v_flag.status not in ('HANDLÄGGS','VÄNTAR') then raise exception 'Final assessment requires HANDLÄGGS or VÄNTAR' using errcode='P0001'; end if;

  v_passage := public.assert_routine_passage_ready(
    'SALU_FINAL_ASSESSMENT',v_flag.regnr,null,
    pg_catalog.jsonb_build_object('flagId',v_flag.flag_id::text)
  );

  update public.salu_flags
  set status='SLUTBEDÖMNING'
  where flag_id=p_flag_id
  returning * into v_flag;

  update public.salu_vehicle_state
  set final_slutbedomning_at=pg_catalog.now(),updated_by=p_actor_id,updated_at=pg_catalog.now()
  where regnr=v_flag.regnr;

  insert into public.salu_events(regnr,flag_id,event_type,event_key,actor_id,actor_source,payload)
  values(
    v_flag.regnr,v_flag.flag_id,'SALU_FLAG_READY_FOR_OWNER_DECISION',
    'salu-final-assessment:'||v_flag.flag_id::text,p_actor_id,'MANUELL',
    pg_catalog.jsonb_build_object('status',v_flag.status,'passage',v_passage)
  ) on conflict(event_key) do nothing;

  return to_jsonb(v_flag) || pg_catalog.jsonb_build_object('passage',v_passage);
end;
$$;

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
  if p_actor_id is null then raise exception 'Manual SALU closure requires actor' using errcode='22023'; end if;
  if p_closure_outcome not in ('FARDIGBEHANDLAD','PLAN_ANDRAD_AVBRUTEN','FARDIG_MED_ACCEPTERAD_AVVIKELSE') then raise exception 'Invalid SALU closure outcome' using errcode='22023'; end if;

  select * into v_flag from public.salu_flags where flag_id=p_flag_id for update;
  if not found then raise exception 'SALU flag not found' using errcode='P0002'; end if;
  if v_flag.status <> 'SLUTBEDÖMNING' then raise exception 'Manual closure requires SLUTBEDÖMNING' using errcode='P0001'; end if;

  v_passage := public.assert_routine_passage_ready(
    'SALU_FINAL_ASSESSMENT',v_flag.regnr,null,
    pg_catalog.jsonb_build_object('flagId',v_flag.flag_id::text)
  );

  select count(*)::integer into v_deviation_count
  from public.salu_checkpoints
  where flag_id=p_flag_id and status='AVVIKELSE';

  if v_deviation_count > 0 and p_closure_outcome <> 'FARDIG_MED_ACCEPTERAD_AVVIKELSE' then
    raise exception 'Remaining SALU deviations require accepted-deviation closure outcome' using errcode='P0001';
  end if;
  if p_closure_outcome in ('PLAN_ANDRAD_AVBRUTEN','FARDIG_MED_ACCEPTERAD_AVVIKELSE')
     and length(trim(coalesce(p_closure_comment,'')))=0 then
    raise exception 'Selected SALU closure outcome requires comment' using errcode='22023';
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
  set final_closed_at=v_flag.closed_at,updated_by=p_actor_id,updated_at=pg_catalog.now()
  where regnr=v_flag.regnr;

  insert into public.salu_events(regnr,flag_id,event_type,event_key,actor_id,actor_source,payload)
  values(
    v_flag.regnr,v_flag.flag_id,'SALU_FLAG_CLOSED_MANUALLY',
    'salu-manual-close:'||v_flag.flag_id::text,p_actor_id,'MANUELL',
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

revoke all on function public.acknowledge_salu_flag_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.record_salu_checkpoint_status_v1(uuid,text,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.create_salu_child_process_v1(uuid,text,text,text,text,text,timestamptz,text,boolean,text,uuid) from public, anon, authenticated;
revoke all on function public.transition_salu_child_process_v1(uuid,text,text,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.move_salu_flag_to_final_assessment_v1(uuid,uuid) from public, anon, authenticated;
revoke all on function public.close_salu_flag_manually_v1(uuid,text,text,uuid) from public, anon, authenticated;

grant execute on function public.acknowledge_salu_flag_v1(uuid,uuid) to service_role;
grant execute on function public.record_salu_checkpoint_status_v1(uuid,text,text,jsonb,uuid) to service_role;
grant execute on function public.create_salu_child_process_v1(uuid,text,text,text,text,text,timestamptz,text,boolean,text,uuid) to service_role;
grant execute on function public.transition_salu_child_process_v1(uuid,text,text,text,jsonb,uuid) to service_role;
grant execute on function public.move_salu_flag_to_final_assessment_v1(uuid,uuid) to service_role;
grant execute on function public.close_salu_flag_manually_v1(uuid,text,text,uuid) to service_role;

commit;
