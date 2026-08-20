begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Idempotently materialize the currently active definition for one vehicle/cycle
-- and append the creation fact to the vehicle journey in the same transaction.
create or replace function public.ensure_vehicle_checkpoint(
  p_regnr text,
  p_checkpoint_code text,
  p_cycle_key text,
  p_due_at timestamptz,
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
  v_created boolean := false;
begin
  select * into v_definition
  from public.checkpoint_definitions
  where checkpoint_code = upper(trim(p_checkpoint_code))
    and active
  order by definition_version desc
  limit 1;

  if not found then
    raise exception 'Active checkpoint definition not found' using errcode = 'P0002';
  end if;

  select * into v_checkpoint
  from public.vehicle_checkpoints
  where regnr = upper(regexp_replace(p_regnr, '\s+', '', 'g'))
    and checkpoint_code = v_definition.checkpoint_code
    and cycle_key = coalesce(nullif(trim(p_cycle_key), ''), 'default')
  for update;

  if not found then
    insert into public.vehicle_checkpoints (
      regnr,
      checkpoint_code,
      definition_version,
      cycle_key,
      due_at,
      source_journey_event_id,
      source_context,
      created_by,
      updated_by
    ) values (
      upper(regexp_replace(p_regnr, '\s+', '', 'g')),
      v_definition.checkpoint_code,
      v_definition.definition_version,
      coalesce(nullif(trim(p_cycle_key), ''), 'default'),
      p_due_at,
      p_source_journey_event_id,
      coalesce(p_source_context, '{}'::jsonb),
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
      pg_catalog.now(),
      'CHECKPOINT_ENGINE',
      'vehicle_checkpoints',
      v_checkpoint.checkpoint_id::text,
      p_actor_id,
      'MANUELL',
      p_actor_email,
      pg_catalog.jsonb_build_object(
        'checkpointId', v_checkpoint.checkpoint_id,
        'checkpointCode', v_checkpoint.checkpoint_code,
        'definitionVersion', v_checkpoint.definition_version,
        'cycleKey', v_checkpoint.cycle_key,
        'dueAt', v_checkpoint.due_at,
        'blocking', v_definition.blocking,
        'verificationMode', v_definition.verification_mode
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'checkpoint_id', v_checkpoint.checkpoint_id,
    'regnr', v_checkpoint.regnr,
    'checkpoint_code', v_checkpoint.checkpoint_code,
    'definition_version', v_checkpoint.definition_version,
    'cycle_key', v_checkpoint.cycle_key,
    'status', v_checkpoint.status,
    'due_at', v_checkpoint.due_at,
    'blocking', v_definition.blocking,
    'verification_mode', v_definition.verification_mode,
    'created', v_created
  );
end;
$$;

revoke all on function public.ensure_vehicle_checkpoint(text, text, text, timestamptz, uuid, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.ensure_vehicle_checkpoint(text, text, text, timestamptz, uuid, jsonb, uuid, text)
  to service_role;

commit;
