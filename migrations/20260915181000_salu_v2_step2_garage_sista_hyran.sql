begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- SALU V2 / Step 2
-- Garage owns the continuing operational plan for a Step 1 SALU_PLANERING object.
-- The original SALU-owned plan remains in salu_plans and is never rewritten here.
-- SISTA HYRAN is an explicit, mandate-gated business decision. No date or Garage field
-- can infer or create that decision implicitly.

insert into public.mandate_capability_definitions (capability_code, title, description)
values (
  'GARAGE_SISTA_HYRAN_DECIDE',
  'Besluta SISTA HYRAN',
  'Får fatta det explicita SISTA HYRAN-beslutet i Garaget för SALU-processen.'
)
on conflict (capability_code) do update
set title = excluded.title,
    description = excluded.description,
    active = true,
    changed_at = now();

-- No employee_mandates are seeded by Step 2. Production assignment is a separate
-- organisational MASTER decision.

alter table public.garage_items
  add column if not exists salu_final_timing_at timestamptz,
  add column if not exists salu_transport_details text,
  add column if not exists salu_repair_destination text,
  add column if not exists salu_operational_note text;

comment on column public.garage_items.salu_final_timing_at is
  'Garage-owned operational timing for a SALU_PLANERING object. Decision support only; it never means SISTA HYRAN by itself.';
comment on column public.garage_items.salu_transport_details is
  'Garage-owned operational transport information for a SALU_PLANERING object.';
comment on column public.garage_items.salu_repair_destination is
  'Garage-owned later repair/workshop destination. Does not rewrite the original SALU plan.';
comment on column public.garage_items.salu_operational_note is
  'Garage-owned operational note. Separate from the original SALU plan note and from historical Garage note content.';

alter table public.garage_items
  add constraint garage_items_salu_planning_directionless_chk
  check (source_kind <> 'SALU_PLANERING' or garage_direction is null);

alter table public.garage_items
  add constraint garage_items_salu_operational_fields_source_chk
  check (
    source_kind = 'SALU_PLANERING'
    or (
      salu_final_timing_at is null
      and salu_transport_details is null
      and salu_repair_destination is null
      and salu_operational_note is null
    )
  );

create table public.garage_salu_operational_events (
  event_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  salu_plan_id uuid not null references public.salu_plans(plan_id) on delete restrict,
  source_salu_flag_id uuid not null references public.salu_flags(flag_id) on delete restrict,
  field_name text not null check (
    field_name in (
      'planned_station',
      'transport_status',
      'salu_final_timing_at',
      'salu_transport_details',
      'salu_repair_destination',
      'salu_operational_note'
    )
  ),
  old_value jsonb,
  new_value jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid not null,
  source_provenance jsonb not null default '{}'::jsonb
);

comment on table public.garage_salu_operational_events is
  'Append-only audit of Garage-owned SALU_PLANERING complements. Original salu_plans facts are referenced, never rewritten.';

create index garage_salu_operational_events_item_time_idx
  on public.garage_salu_operational_events(garage_item_id, changed_at desc);

create or replace function public.reject_garage_salu_operational_event_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'garage_salu_operational_events is append-only' using errcode = 'P0001';
end;
$$;

create or replace function public.audit_garage_salu_operational_changes_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_plan_id uuid;
  v_provenance jsonb;
begin
  if new.source_kind <> 'SALU_PLANERING' then
    return new;
  end if;

  if new.source_salu_flag_id is null then
    raise exception 'SALU_PLANERING requires exact SALU source' using errcode = '23514';
  end if;
  if new.updated_by is null then
    raise exception 'Garage SALU operational change requires actor provenance' using errcode = '23514';
  end if;

  select p.plan_id into v_plan_id
  from public.salu_plans p
  where p.flag_id = new.source_salu_flag_id;

  if v_plan_id is null then
    raise exception 'SALU_PLANERING requires exact salu_plans source' using errcode = '23514';
  end if;

  v_provenance := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'sourceKind', new.source_kind,
    'sourceSaluFlagId', new.source_salu_flag_id,
    'saluPlanId', v_plan_id
  ));

  if new.planned_station is distinct from old.planned_station then
    insert into public.garage_salu_operational_events(
      garage_item_id,salu_plan_id,source_salu_flag_id,field_name,old_value,new_value,changed_at,changed_by,source_provenance
    ) values (
      new.garage_item_id,v_plan_id,new.source_salu_flag_id,'planned_station',
      pg_catalog.to_jsonb(old.planned_station),pg_catalog.to_jsonb(new.planned_station),new.updated_at,new.updated_by,v_provenance
    );
  end if;

  if new.transport_status is distinct from old.transport_status then
    insert into public.garage_salu_operational_events(
      garage_item_id,salu_plan_id,source_salu_flag_id,field_name,old_value,new_value,changed_at,changed_by,source_provenance
    ) values (
      new.garage_item_id,v_plan_id,new.source_salu_flag_id,'transport_status',
      pg_catalog.to_jsonb(old.transport_status),pg_catalog.to_jsonb(new.transport_status),new.updated_at,new.updated_by,v_provenance
    );
  end if;

  if new.salu_final_timing_at is distinct from old.salu_final_timing_at then
    insert into public.garage_salu_operational_events(
      garage_item_id,salu_plan_id,source_salu_flag_id,field_name,old_value,new_value,changed_at,changed_by,source_provenance
    ) values (
      new.garage_item_id,v_plan_id,new.source_salu_flag_id,'salu_final_timing_at',
      pg_catalog.to_jsonb(old.salu_final_timing_at),pg_catalog.to_jsonb(new.salu_final_timing_at),new.updated_at,new.updated_by,v_provenance
    );
  end if;

  if new.salu_transport_details is distinct from old.salu_transport_details then
    insert into public.garage_salu_operational_events(
      garage_item_id,salu_plan_id,source_salu_flag_id,field_name,old_value,new_value,changed_at,changed_by,source_provenance
    ) values (
      new.garage_item_id,v_plan_id,new.source_salu_flag_id,'salu_transport_details',
      pg_catalog.to_jsonb(old.salu_transport_details),pg_catalog.to_jsonb(new.salu_transport_details),new.updated_at,new.updated_by,v_provenance
    );
  end if;

  if new.salu_repair_destination is distinct from old.salu_repair_destination then
    insert into public.garage_salu_operational_events(
      garage_item_id,salu_plan_id,source_salu_flag_id,field_name,old_value,new_value,changed_at,changed_by,source_provenance
    ) values (
      new.garage_item_id,v_plan_id,new.source_salu_flag_id,'salu_repair_destination',
      pg_catalog.to_jsonb(old.salu_repair_destination),pg_catalog.to_jsonb(new.salu_repair_destination),new.updated_at,new.updated_by,v_provenance
    );
  end if;

  if new.salu_operational_note is distinct from old.salu_operational_note then
    insert into public.garage_salu_operational_events(
      garage_item_id,salu_plan_id,source_salu_flag_id,field_name,old_value,new_value,changed_at,changed_by,source_provenance
    ) values (
      new.garage_item_id,v_plan_id,new.source_salu_flag_id,'salu_operational_note',
      pg_catalog.to_jsonb(old.salu_operational_note),pg_catalog.to_jsonb(new.salu_operational_note),new.updated_at,new.updated_by,v_provenance
    );
  end if;

  return new;
end;
$$;

create trigger garage_salu_operational_events_append_only
before update or delete on public.garage_salu_operational_events
for each row execute function public.reject_garage_salu_operational_event_mutation_v1();

create trigger garage_items_salu_operational_audit_v1
after update of planned_station, transport_status, salu_final_timing_at, salu_transport_details, salu_repair_destination, salu_operational_note
on public.garage_items
for each row execute function public.audit_garage_salu_operational_changes_v1();

create table public.garage_sista_hyran_decisions (
  decision_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  salu_plan_id uuid not null references public.salu_plans(plan_id) on delete restrict,
  source_salu_flag_id uuid not null references public.salu_flags(flag_id) on delete restrict,
  regnr text not null,
  decision_status text not null default 'SISTA HYRAN' check (decision_status = 'SISTA HYRAN'),
  decision_version integer not null check (decision_version > 0),
  last_rental_at timestamptz,
  decision_note text,
  decided_at timestamptz not null default now(),
  decided_by_employee_id uuid not null references public.employees(id) on delete restrict,
  decided_by_auth_user_id uuid not null,
  idempotency_key text not null check (length(pg_catalog.btrim(idempotency_key)) between 1 and 500),
  supersedes_decision_id uuid references public.garage_sista_hyran_decisions(decision_id) on delete restrict,
  unique (garage_item_id, decision_version),
  unique (garage_item_id, idempotency_key)
);

comment on table public.garage_sista_hyran_decisions is
  'Append-only explicit SISTA HYRAN decisions. Existence of a row is the decision; dates elsewhere never infer one. New decisions supersede by version without overwriting history.';

create index garage_sista_hyran_decisions_item_time_idx
  on public.garage_sista_hyran_decisions(garage_item_id, decision_version desc, decided_at desc);

create or replace function public.reject_garage_sista_hyran_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'garage_sista_hyran_decisions is append-only' using errcode = 'P0001';
end;
$$;

create trigger garage_sista_hyran_decisions_append_only
before update or delete on public.garage_sista_hyran_decisions
for each row execute function public.reject_garage_sista_hyran_mutation_v1();

create or replace view public.garage_sista_hyran_current
with (security_invoker = true)
as
select distinct on (d.garage_item_id)
  d.decision_id,
  d.garage_item_id,
  d.salu_plan_id,
  d.source_salu_flag_id,
  d.regnr,
  true as sista_hyran,
  d.decision_status,
  d.decision_version,
  d.last_rental_at,
  d.decision_note,
  d.decided_at,
  d.decided_by_employee_id,
  d.decided_by_auth_user_id,
  d.supersedes_decision_id
from public.garage_sista_hyran_decisions d
order by d.garage_item_id, d.decision_version desc, d.decided_at desc;

comment on view public.garage_sista_hyran_current is
  'Step 3 read contract: a row means SISTA HYRAN=true from an explicit Garage decision. No row means no decision.';

create or replace function public.decide_garage_sista_hyran_v1(
  p_garage_item_id uuid,
  p_employee_id uuid,
  p_auth_user_id uuid,
  p_last_rental_at timestamptz,
  p_decision_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.garage_items%rowtype;
  v_plan public.salu_plans%rowtype;
  v_existing public.garage_sista_hyran_decisions%rowtype;
  v_previous public.garage_sista_hyran_decisions%rowtype;
  v_decision public.garage_sista_hyran_decisions%rowtype;
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_garage_item_id is null then
    raise exception 'Garage item krävs' using errcode = '22023';
  end if;
  if p_employee_id is null or p_auth_user_id is null then
    raise exception 'Verifierad employee och auth-identitet krävs' using errcode = '42501';
  end if;
  if v_key = '' then
    raise exception 'Idempotency key krävs' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('garage-sista-hyran:' || p_garage_item_id::text));

  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage item finns inte' using errcode = 'P0002';
  end if;
  if v_item.voided_at is not null then
    raise exception 'Makulerat Garage-objekt kan inte beslutas' using errcode = 'P0001';
  end if;
  if v_item.handed_off_nybil_id is not null or v_item.completed_at is not null then
    raise exception 'Garage-objektet är redan i en senare låst fas' using errcode = 'P0001';
  end if;
  if v_item.source_kind <> 'SALU_PLANERING' or v_item.source_salu_flag_id is null then
    raise exception 'SISTA HYRAN kräver exakt SALU_PLANERING-källa' using errcode = 'P0001';
  end if;
  if v_item.garage_direction is not null then
    raise exception 'SALU_PLANERING får inte ha fysisk IN/UT-riktning' using errcode = '23514';
  end if;

  select * into v_plan
  from public.salu_plans
  where flag_id = v_item.source_salu_flag_id;

  if not found then
    raise exception 'Exakt ursprunglig SALU-plan saknas' using errcode = 'P0002';
  end if;

  perform public.assert_actor_process_mandate(
    p_employee_id,
    'GARAGE_SISTA_HYRAN_DECIDE',
    'BILKONTROLLCHEF',
    'PROCESS',
    'SALU'
  );

  select * into v_existing
  from public.garage_sista_hyran_decisions
  where garage_item_id = p_garage_item_id
    and idempotency_key = v_key;

  if found then
    return pg_catalog.jsonb_build_object(
      'decision', pg_catalog.to_jsonb(v_existing),
      'sistaHyran', true,
      'idempotentReplay', true,
      'terminalClosure', false,
      'avvecklaStarted', false,
      'canonicalFleetExit', false,
      'checkinWritten', false,
      'physicalGaragePositionChanged', false
    );
  end if;

  select * into v_previous
  from public.garage_sista_hyran_decisions
  where garage_item_id = p_garage_item_id
  order by decision_version desc
  limit 1;

  insert into public.garage_sista_hyran_decisions (
    garage_item_id,
    salu_plan_id,
    source_salu_flag_id,
    regnr,
    decision_status,
    decision_version,
    last_rental_at,
    decision_note,
    decided_at,
    decided_by_employee_id,
    decided_by_auth_user_id,
    idempotency_key,
    supersedes_decision_id
  ) values (
    v_item.garage_item_id,
    v_plan.plan_id,
    v_item.source_salu_flag_id,
    v_plan.regnr,
    'SISTA HYRAN',
    coalesce(v_previous.decision_version, 0) + 1,
    p_last_rental_at,
    nullif(pg_catalog.btrim(coalesce(p_decision_note, '')), ''),
    v_now,
    p_employee_id,
    p_auth_user_id,
    v_key,
    v_previous.decision_id
  ) returning * into v_decision;

  return pg_catalog.jsonb_build_object(
    'decision', pg_catalog.to_jsonb(v_decision),
    'sistaHyran', true,
    'idempotentReplay', false,
    'terminalClosure', false,
    'avvecklaStarted', false,
    'canonicalFleetExit', false,
    'checkinWritten', false,
    'physicalGaragePositionChanged', false
  );
end;
$$;

alter table public.garage_salu_operational_events enable row level security;
alter table public.garage_sista_hyran_decisions enable row level security;

revoke all on public.garage_salu_operational_events from public, anon, authenticated;
revoke all on public.garage_sista_hyran_decisions from public, anon, authenticated;
revoke all on public.garage_sista_hyran_current from public, anon, authenticated;

grant select, insert on public.garage_salu_operational_events to service_role;
grant select, insert on public.garage_sista_hyran_decisions to service_role;
grant select on public.garage_sista_hyran_current to service_role;

revoke all on function public.reject_garage_salu_operational_event_mutation_v1() from public, anon, authenticated;
revoke all on function public.audit_garage_salu_operational_changes_v1() from public, anon, authenticated;
revoke all on function public.reject_garage_sista_hyran_mutation_v1() from public, anon, authenticated;
revoke all on function public.decide_garage_sista_hyran_v1(uuid,uuid,uuid,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.decide_garage_sista_hyran_v1(uuid,uuid,uuid,timestamptz,text,text) to service_role;

comment on function public.decide_garage_sista_hyran_v1(uuid,uuid,uuid,timestamptz,text,text) is
  'SALU V2 Step 2 explicit SISTA HYRAN decision. Requires BILKONTROLLCHEF + GARAGE_SISTA_HYRAN_DECIDE + PROCESS/SALU mandate. Never closes SALU, starts AVVECKLA, creates canonical fleet EXIT, writes Check-in or fabricates Garage IN/UT.';

commit;
