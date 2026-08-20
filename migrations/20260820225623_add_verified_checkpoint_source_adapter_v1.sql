begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Atomically materialize and verify one SYSTEM checkpoint from a concrete
-- source record. Repeating the same source cycle is idempotent.
create or replace function public.record_verified_source_checkpoint(
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
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_definition public.checkpoint_definitions%rowtype;
  v_checkpoint public.vehicle_checkpoints%rowtype;
  v_assessment_id uuid;
  v_regnr text;
  v_cycle_key text;
  v_source_entity text;
  v_source_record_id text;
  v_source_context jsonb;
  v_created boolean := false;
  v_assessed boolean := false;
begin
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  v_cycle_key := coalesce(nullif(trim(p_cycle_key), ''), 'default');
  v_source_entity := nullif(trim(p_source_entity), '');
  v_source_record_id := nullif(trim(p_source_record_id), '');

  if length(v_regnr) = 0 then
    raise exception 'Invalid regnr' using errcode = '22023';
  end if;

  if p_occurred_at is null then
    raise exception 'Source occurrence time is required' using errcode = '22023';
  end if;

  if v_source_entity is null or v_source_record_id is null then
    raise exception 'Source identity is required' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_source_context, '{}'::jsonb)) <> 'object' then
    raise exception 'Source context must be an object' using errcode = '22023';
  end if;

  select * into v_definition
  from public.checkpoint_definitions
  where checkpoint_code = upper(trim(p_checkpoint_code))
    and active
  order by definition_version desc
  limit 1;

  if not found then
    raise exception 'Active checkpoint definition not found' using errcode = 'P0002';
  end if;

  if v_definition.verification_mode <> 'SYSTEM' then
    raise exception 'Source adapter requires a SYSTEM checkpoint definition' using errcode = '22023';
  end if;

  v_source_context := coalesce(p_source_context, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'sourceEntity', v_source_entity,
      'sourceRecordId', v_source_record_id,
      'occurredAt', p_occurred_at
    );

  select * into v_checkpoint
  from public.vehicle_checkpoints
  where regnr = v_regnr
    and checkpoint_code = v_definition.checkpoint_code
    and cycle_key = v_cycle_key
  for update;

  if not found then
    insert into public.vehicle_checkpoints (
      regnr,
      checkpoint_code,
      definition_version,
      cycle_key,
      status,
      source_journey_event_id,
      source_context,
      created_by,
      updated_by
    ) values (
      v_regnr,
      v_definition.checkpoint_code,
      v_definition.definition_version,
      v_cycle_key,
      'VANTAR',
      p_source_journey_event_id,
      v_source_context,
      p_actor_id,
      p_actor_id
    )
    returning * into v_checkpoint;

    v_created := true;

    insert into public.vehicle_journey_events (
      regnr,
      event_type,
      event_key,
      occurred_at,
      source_system,
      source_entity,
      source_record_id,
      actor_id,
      actor_source,
      actor_email,
      payload
    ) values (
      v_checkpoint.regnr,
      'CHECKPOINT_CREATED',
      'checkpoint-created:' || v_checkpoint.checkpoint_id::text,
      p_occurred_at,
      'CHECKPOINT_ENGINE',
      v_source_entity,
      v_source_record_id,
      p_actor_id,
      'SYSTEM',
      p_actor_email,
      pg_catalog.jsonb_build_object(
        'checkpointId', v_checkpoint.checkpoint_id,
        'checkpointCode', v_checkpoint.checkpoint_code,
        'definitionVersion', v_checkpoint.definition_version,
        'cycleKey', v_checkpoint.cycle_key,
        'blocking', v_definition.blocking,
        'verificationMode', v_definition.verification_mode,
        'sourceContext', v_source_context
      )
    );
  else
    update public.vehicle_checkpoints
    set source_journey_event_id = coalesce(source_journey_event_id, p_source_journey_event_id),
        source_context = v_source_context,
        updated_by = p_actor_id,
        updated_at = pg_catalog.now()
    where checkpoint_id = v_checkpoint.checkpoint_id
    returning * into v_checkpoint;
  end if;

  if v_checkpoint.status <> 'GODKAND' then
    insert into public.checkpoint_assessments (
      checkpoint_id,
      previous_status,
      status,
      comment,
      evidence_refs,
      actor_id,
      actor_email,
      actor_source,
      assessed_at,
      metadata
    ) values (
      v_checkpoint.checkpoint_id,
      v_checkpoint.status,
      'GODKAND',
      null,
      pg_catalog.jsonb_build_array(v_source_entity || ':' || v_source_record_id),
      p_actor_id,
      p_actor_email,
      'SYSTEM',
      p_occurred_at,
      pg_catalog.jsonb_build_object('sourceContext', v_source_context)
    )
    returning assessment_id into v_assessment_id;

    update public.vehicle_checkpoints
    set status = 'GODKAND',
        updated_by = p_actor_id,
        updated_at = pg_catalog.now()
    where checkpoint_id = v_checkpoint.checkpoint_id
    returning * into v_checkpoint;

    insert into public.vehicle_journey_events (
      regnr,
      event_type,
      event_key,
      occurred_at,
      source_system,
      source_entity,
      source_record_id,
      actor_id,
      actor_source,
      actor_email,
      payload
    ) values (
      v_checkpoint.regnr,
      'CHECKPOINT_ASSESSED',
      'checkpoint-assessment:' || v_assessment_id::text,
      p_occurred_at,
      'CHECKPOINT_ENGINE',
      v_source_entity,
      v_source_record_id,
      p_actor_id,
      'SYSTEM',
      p_actor_email,
      pg_catalog.jsonb_build_object(
        'assessmentId', v_assessment_id,
        'checkpointId', v_checkpoint.checkpoint_id,
        'checkpointCode', v_checkpoint.checkpoint_code,
        'definitionVersion', v_checkpoint.definition_version,
        'cycleKey', v_checkpoint.cycle_key,
        'previousStatus', 'VANTAR',
        'status', 'GODKAND',
        'blocking', v_definition.blocking,
        'verificationMode', v_definition.verification_mode,
        'sourceContext', v_source_context
      )
    );

    v_assessed := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'checkpoint_id', v_checkpoint.checkpoint_id,
    'checkpoint_code', v_checkpoint.checkpoint_code,
    'definition_version', v_checkpoint.definition_version,
    'cycle_key', v_checkpoint.cycle_key,
    'status', v_checkpoint.status,
    'created', v_created,
    'assessed', v_assessed,
    'source_entity', v_source_entity,
    'source_record_id', v_source_record_id
  );
end;
$$;

revoke all on function public.record_verified_source_checkpoint(text, text, text, timestamptz, text, text, uuid, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_verified_source_checkpoint(text, text, text, timestamptz, text, text, uuid, jsonb, uuid, text)
  to service_role;

commit;
