begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Layer 2.3: PASSAGE / BLOCKERING.
-- Passage is a readiness decision. It does not mutate source-owned business state.
create table public.passage_definitions (
  passage_code text not null,
  passage_version integer not null check (passage_version > 0),
  routine_code text not null,
  routine_version integer not null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  target_state text not null check (length(trim(target_state)) between 1 and 120),
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (passage_code, passage_version),
  foreign key (routine_code, routine_version)
    references public.routine_definitions(routine_code, routine_version)
    on delete restrict,
  check (passage_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$')
);

create unique index passage_definitions_one_active_version_uidx
  on public.passage_definitions (passage_code)
  where active;

create table public.passage_requirements (
  passage_code text not null,
  passage_version integer not null,
  requirement_code text not null,
  requirement_type text not null check (requirement_type in ('HANDOFF','CHECKPOINT')),
  reference_code text not null,
  reference_version integer not null check (reference_version > 0),
  sequence_order integer not null check (sequence_order > 0),
  active boolean not null default true,
  primary key (passage_code, passage_version, requirement_code),
  foreign key (passage_code, passage_version)
    references public.passage_definitions(passage_code, passage_version)
    on delete restrict,
  check (requirement_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$'),
  check (reference_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$')
);

create index passage_requirements_reference_idx
  on public.passage_requirements (requirement_type, reference_code, reference_version);

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
  v_flag_id text := nullif(p_context ->> 'flagId', '');
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

    if v_requirement.requirement_type = 'HANDOFF' then
      select h.status, true
        into v_status, v_found
      from public.handoffs h
      where h.regnr = upper(trim(p_regnr))
        and h.handoff_code = v_requirement.reference_code
        and h.handoff_version = v_requirement.reference_version
        and (v_flag_id is null or h.metadata ->> 'flagId' = v_flag_id)
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

create or replace function public.assert_routine_passage_ready(
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
  v_result jsonb;
begin
  v_result := public.evaluate_routine_passage(p_passage_code, p_regnr, p_cycle_key, p_context);
  if coalesce((v_result ->> 'ready')::boolean, false) is not true then
    raise exception 'Passage blocked: %', v_result -> 'reasons' using errcode = 'P0001';
  end if;
  return v_result;
end;
$$;

-- First vertical passage: SALU may proceed to final assessment only when the
-- two already-defined blocking handoffs have been resolved. This does not
-- change salu_flags.status; source-owned transition remains separate.
insert into public.passage_definitions (
  passage_code, passage_version, routine_code, routine_version,
  title, description, target_state, active
) values (
  'SALU_FINAL_ASSESSMENT', 1, 'SALU_CYCLE', 1,
  'SALU till slutbedömning',
  'Readiness-gate före SALU:s källägda slutbedömning.',
  'SLUTBEDÖMNING', true
)
on conflict (passage_code, passage_version) do nothing;

insert into public.passage_requirements (
  passage_code, passage_version, requirement_code, requirement_type,
  reference_code, reference_version, sequence_order, active
) values
  ('SALU_FINAL_ASSESSMENT', 1, 'PLANERING_HANDOFF_RESOLVED', 'HANDOFF', 'SALU_TO_PLANERING', 1, 1, true),
  ('SALU_FINAL_ASSESSMENT', 1, 'INKOP_HANDOFF_RESOLVED', 'HANDOFF', 'SALU_TO_INKOP', 1, 2, true)
on conflict (passage_code, passage_version, requirement_code) do nothing;

alter table public.passage_definitions enable row level security;
alter table public.passage_requirements enable row level security;

revoke all on public.passage_definitions from public, anon, authenticated;
revoke all on public.passage_requirements from public, anon, authenticated;
revoke all on function public.evaluate_routine_passage(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.assert_routine_passage_ready(text,text,text,jsonb) from public, anon, authenticated;

grant select, insert, update, delete on public.passage_definitions to service_role;
grant select, insert, update, delete on public.passage_requirements to service_role;
grant execute on function public.evaluate_routine_passage(text,text,text,jsonb) to service_role;
grant execute on function public.assert_routine_passage_ready(text,text,text,jsonb) to service_role;

commit;
