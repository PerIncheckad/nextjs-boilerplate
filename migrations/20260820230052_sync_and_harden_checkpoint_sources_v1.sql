begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Enforce verification semantics even for direct service-role inserts. A
-- SYSTEM checkpoint may only be assessed from a verified system source.
create or replace function public.enforce_checkpoint_assessment_verification_mode()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_verification_mode text;
begin
  select definition.verification_mode
  into v_verification_mode
  from public.vehicle_checkpoints checkpoint
  join public.checkpoint_definitions definition
    on definition.checkpoint_code = checkpoint.checkpoint_code
   and definition.definition_version = checkpoint.definition_version
  where checkpoint.checkpoint_id = new.checkpoint_id;

  if not found then
    raise exception 'Checkpoint definition not found for assessment' using errcode = 'P0002';
  end if;

  if v_verification_mode = 'SYSTEM' and new.actor_source <> 'SYSTEM' then
    raise exception 'System checkpoint can only be assessed by a system source' using errcode = '22023';
  end if;

  if v_verification_mode = 'EVIDENCE_REQUIRED'
     and new.status = 'GODKAND'
     and pg_catalog.jsonb_array_length(coalesce(new.evidence_refs, '[]'::jsonb)) = 0 then
    raise exception 'Approved checkpoint requires evidence' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists checkpoint_assessments_verification_mode_insert
  on public.checkpoint_assessments;
create trigger checkpoint_assessments_verification_mode_insert
before insert on public.checkpoint_assessments
for each row execute function public.enforce_checkpoint_assessment_verification_mode();

-- Synchronize all supported source facts for one vehicle in one database
-- transaction. No source data is altered and no checkpoint is inferred without
-- a concrete Nybil, completed Check-in or SALU flag record.
create or replace function public.sync_vehicle_source_checkpoints(
  p_regnr text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text;
  v_result jsonb;
  v_total integer := 0;
  v_created integer := 0;
  v_assessed integer := 0;
  v_nybil integer := 0;
  v_checkins integer := 0;
  v_salu_cycles integer := 0;
  v_row record;
begin
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  if v_regnr !~ '^[A-Z]{3}[0-9]{2}[0-9A-Z]$' then
    raise exception 'Invalid regnr' using errcode = '22023';
  end if;

  for v_row in
    select id, created_at, updated_at
    from public.nybil_inventering
    where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_regnr
    order by created_at, id
  loop
    v_result := public.record_verified_source_checkpoint(
      v_regnr,
      'NYBIL_BASELINE_CAPTURED',
      'nybil:' || v_row.id::text,
      coalesce(v_row.created_at, v_row.updated_at, pg_catalog.now()),
      'nybil_inventering',
      v_row.id::text,
      null,
      pg_catalog.jsonb_build_object(
        'sourceKind', 'NYBIL_BASELINE',
        'sourceStatus', 'RECORDED'
      ),
      p_actor_id,
      p_actor_email
    );

    v_total := v_total + 1;
    v_nybil := v_nybil + 1;
    if coalesce((v_result ->> 'created')::boolean, false) then v_created := v_created + 1; end if;
    if coalesce((v_result ->> 'assessed')::boolean, false) then v_assessed := v_assessed + 1; end if;
  end loop;

  for v_row in
    select id, completed_at, checker_name, checker_email, completed_by
    from public.checkins
    where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_regnr
      and status = 'COMPLETED'
      and completed_at is not null
    order by completed_at, id
  loop
    v_result := public.record_verified_source_checkpoint(
      v_regnr,
      'CHECKIN_COMPLETED',
      'checkin:' || v_row.id::text,
      v_row.completed_at,
      'checkins',
      v_row.id::text,
      null,
      pg_catalog.jsonb_build_object(
        'sourceKind', 'CHECKIN',
        'sourceStatus', 'COMPLETED',
        'completedBy', v_row.completed_by,
        'checkerName', v_row.checker_name,
        'checkerEmail', v_row.checker_email
      ),
      p_actor_id,
      p_actor_email
    );

    v_total := v_total + 1;
    v_checkins := v_checkins + 1;
    if coalesce((v_result ->> 'created')::boolean, false) then v_created := v_created + 1; end if;
    if coalesce((v_result ->> 'assessed')::boolean, false) then v_assessed := v_assessed + 1; end if;
  end loop;

  for v_row in
    select flag_id, cycle_saludatum, current_saludatum, status, owner_function, created_at
    from public.salu_flags
    where upper(regexp_replace(regnr, '\s+', '', 'g')) = v_regnr
    order by created_at, flag_id
  loop
    v_result := public.record_verified_source_checkpoint(
      v_regnr,
      'SALU_CYCLE_CREATED',
      'salu:' || v_row.flag_id::text,
      v_row.created_at,
      'salu_flags',
      v_row.flag_id::text,
      null,
      pg_catalog.jsonb_build_object(
        'sourceKind', 'SALU_CYCLE',
        'sourceStatus', v_row.status,
        'cycleSaludatum', v_row.cycle_saludatum,
        'currentSaludatum', v_row.current_saludatum,
        'ownerFunction', v_row.owner_function
      ),
      p_actor_id,
      p_actor_email
    );

    v_total := v_total + 1;
    v_salu_cycles := v_salu_cycles + 1;
    if coalesce((v_result ->> 'created')::boolean, false) then v_created := v_created + 1; end if;
    if coalesce((v_result ->> 'assessed')::boolean, false) then v_assessed := v_assessed + 1; end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'regnr', v_regnr,
    'sources', pg_catalog.jsonb_build_object(
      'nybil', v_nybil,
      'completedCheckins', v_checkins,
      'saluCycles', v_salu_cycles,
      'total', v_total
    ),
    'created', v_created,
    'assessed', v_assessed,
    'unchanged', v_total - v_assessed
  );
end;
$$;

revoke all on function public.enforce_checkpoint_assessment_verification_mode()
  from public, anon, authenticated;
revoke all on function public.sync_vehicle_source_checkpoints(text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.enforce_checkpoint_assessment_verification_mode()
  to service_role;
grant execute on function public.sync_vehicle_source_checkpoints(text, uuid, text)
  to service_role;

commit;
