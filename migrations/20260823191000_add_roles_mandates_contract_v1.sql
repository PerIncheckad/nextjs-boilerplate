begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Layer 2.5: ROLLER & MANDAT.
-- Authentication proves identity. Mandate proves that an identified employee may
-- perform a specific business action in a specific function/scope.
create table public.business_function_definitions (
  function_code text primary key,
  title text not null check (length(trim(title)) between 1 and 160),
  description text,
  active boolean not null default true,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  check (function_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$')
);

create table public.mandate_capability_definitions (
  capability_code text primary key,
  title text not null check (length(trim(title)) between 1 and 160),
  description text,
  active boolean not null default true,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  check (capability_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$')
);

create table public.employee_mandates (
  mandate_id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  function_code text not null references public.business_function_definitions(function_code) on delete restrict,
  capability_code text not null references public.mandate_capability_definitions(capability_code) on delete restrict,
  scope_type text not null default 'GLOBAL'
    check (scope_type in ('GLOBAL','PROCESS','ROUTINE','HANDOFF','CHECKPOINT')),
  scope_code text,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  granted_by uuid,
  grant_reason text,
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_type = 'GLOBAL' and scope_code is null) or (scope_type <> 'GLOBAL' and length(trim(coalesce(scope_code,''))) > 0)),
  check (valid_until is null or valid_until > valid_from),
  check ((revoked_at is null) = (revoked_by is null)),
  check (revoked_at is null or length(trim(coalesce(revoke_reason,''))) > 0)
);

create unique index employee_mandates_active_uidx
  on public.employee_mandates (
    employee_id,
    function_code,
    capability_code,
    scope_type,
    coalesce(scope_code, '')
  )
  where active and revoked_at is null;

create index employee_mandates_lookup_idx
  on public.employee_mandates (employee_id, capability_code, function_code, active, valid_from, valid_until);

create table public.mandate_events (
  mandate_event_id uuid primary key default gen_random_uuid(),
  mandate_id uuid not null references public.employee_mandates(mandate_id) on delete restrict,
  event_type text not null check (event_type in ('MANDATE_GRANTED','MANDATE_REVOKED')),
  actor_id uuid,
  reason text,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(payload) = 'object')
);

create index mandate_events_mandate_time_idx
  on public.mandate_events (mandate_id, occurred_at desc);

create or replace function public.reject_mandate_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'mandate_events is append-only';
end;
$$;

create trigger mandate_events_append_only_update
before update on public.mandate_events
for each row execute function public.reject_mandate_event_mutation();

create trigger mandate_events_append_only_delete
before delete on public.mandate_events
for each row execute function public.reject_mandate_event_mutation();

create or replace function public.actor_has_process_mandate(
  p_employee_id uuid,
  p_capability_code text,
  p_required_function text default null,
  p_scope_type text default 'GLOBAL',
  p_scope_code text default null,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.employee_mandates m
    join public.employees e on e.id = m.employee_id
    join public.business_function_definitions f on f.function_code = m.function_code and f.active
    join public.mandate_capability_definitions c on c.capability_code = m.capability_code and c.active
    where m.employee_id = p_employee_id
      and m.active
      and m.revoked_at is null
      and coalesce(e.is_active, false)
      and coalesce(e.active, true)
      and m.capability_code = upper(trim(p_capability_code))
      and (p_required_function is null or m.function_code = upper(trim(p_required_function)))
      and m.valid_from <= p_at
      and (m.valid_until is null or m.valid_until > p_at)
      and (
        m.scope_type = 'GLOBAL'
        or (
          m.scope_type = upper(trim(coalesce(p_scope_type, 'GLOBAL')))
          and m.scope_code = nullif(upper(trim(coalesce(p_scope_code, ''))), '')
        )
      )
  );
$$;

create or replace function public.assert_actor_process_mandate(
  p_employee_id uuid,
  p_capability_code text,
  p_required_function text default null,
  p_scope_type text default 'GLOBAL',
  p_scope_code text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not public.actor_has_process_mandate(
    p_employee_id,
    p_capability_code,
    p_required_function,
    p_scope_type,
    p_scope_code,
    pg_catalog.now()
  ) then
    raise exception 'Mandate denied for employee %, capability %, function %, scope %/%',
      p_employee_id, p_capability_code, p_required_function, p_scope_type, p_scope_code
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.transition_handoff_authorized(
  p_handoff_id uuid,
  p_next_status text,
  p_comment text,
  p_evidence_refs jsonb,
  p_employee_id uuid,
  p_actor_email text,
  p_actor_source text default 'MANUELL'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_handoff public.handoffs%rowtype;
  v_definition public.handoff_definitions%rowtype;
  v_capability text;
  v_required_function text;
  v_scope_type text := 'HANDOFF';
  v_scope_code text;
begin
  select * into v_handoff
  from public.handoffs
  where handoff_id = p_handoff_id;

  if not found then
    raise exception 'Handoff not found' using errcode = 'P0002';
  end if;

  select * into v_definition
  from public.handoff_definitions
  where handoff_code = v_handoff.handoff_code
    and handoff_version = v_handoff.handoff_version;

  v_scope_code := v_handoff.handoff_code;

  case p_next_status
    when 'HANDED_OVER' then
      v_capability := 'HANDOFF_HAND_OVER';
      v_required_function := v_definition.from_function;
    when 'RECEIVED' then
      v_capability := 'HANDOFF_RECEIVE';
      v_required_function := v_definition.to_function;
    when 'ACCEPTED' then
      v_capability := 'HANDOFF_ACCEPT';
      v_required_function := v_definition.to_function;
    when 'COMPLETED' then
      v_capability := 'HANDOFF_COMPLETE';
      v_required_function := v_definition.to_function;
    when 'VERIFIED' then
      v_capability := 'HANDOFF_VERIFY';
      v_required_function := null;
    when 'CANCELLED' then
      v_capability := 'HANDOFF_CANCEL';
      v_required_function := null;
    else
      raise exception 'Unsupported authorized handoff status' using errcode = '22023';
  end case;

  perform public.assert_actor_process_mandate(
    p_employee_id,
    v_capability,
    v_required_function,
    v_scope_type,
    v_scope_code
  );

  return public.transition_handoff(
    p_handoff_id,
    p_next_status,
    p_comment,
    p_evidence_refs,
    p_employee_id,
    p_actor_email,
    p_actor_source
  );
end;
$$;

insert into public.business_function_definitions (function_code, title, description)
values
  ('BILKONTROLL', 'Bilkontroll', 'Källfunktion som redan äger SALU-processens kontrollansvar.'),
  ('PLANERING', 'Planering', 'Mottagande funktion i befintligt SALU-handslag.'),
  ('INKÖP', 'Inköp', 'Mottagande funktion i befintligt SALU-handslag.')
on conflict (function_code) do nothing;

insert into public.mandate_capability_definitions (capability_code, title, description)
values
  ('HANDOFF_HAND_OVER', 'Lämna över handslag', 'Får markera att uppdrag/fakta faktiskt har lämnats över.'),
  ('HANDOFF_RECEIVE', 'Ta emot handslag', 'Får kvittera mottagande.'),
  ('HANDOFF_ACCEPT', 'Acceptera ansvar', 'Får aktivt acceptera ansvar för handslaget.'),
  ('HANDOFF_COMPLETE', 'Rapportera utfört', 'Får rapportera att åtgärden är klar för verifiering.'),
  ('HANDOFF_VERIFY', 'Verifiera handslag', 'Får verifiera utfallet när mandat uttryckligen tilldelats.'),
  ('HANDOFF_CANCEL', 'Avbryta handslag', 'Får avbryta ett handslag med angiven orsak när mandat uttryckligen tilldelats.'),
  ('CHECKPOINT_ASSESS', 'Bedöma kontrollpunkt', 'Får bedöma en kontrollpunkt när mandat uttryckligen tilldelats.'),
  ('ACTION_ACCEPT', 'Acceptera åtgärd', 'Får acceptera en tilldelad åtgärd.'),
  ('ACTION_PROGRESS', 'Utföra åtgärd', 'Får rapportera progression i en åtgärd.'),
  ('ACTION_VERIFY', 'Verifiera åtgärd', 'Får verifiera ett åtgärdsutfall.')
on conflict (capability_code) do nothing;

alter table public.business_function_definitions enable row level security;
alter table public.mandate_capability_definitions enable row level security;
alter table public.employee_mandates enable row level security;
alter table public.mandate_events enable row level security;

revoke all on public.business_function_definitions from public, anon, authenticated;
revoke all on public.mandate_capability_definitions from public, anon, authenticated;
revoke all on public.employee_mandates from public, anon, authenticated;
revoke all on public.mandate_events from public, anon, authenticated;
revoke all on function public.reject_mandate_event_mutation() from public, anon, authenticated;
revoke all on function public.actor_has_process_mandate(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.assert_actor_process_mandate(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.transition_handoff_authorized(uuid,text,text,jsonb,uuid,text,text) from public, anon, authenticated;

-- Existing raw transition remains server-internal for migrations/repair paths.
-- Product/API paths must use transition_handoff_authorized once employee mandates are assigned.
grant select, insert, update, delete on public.business_function_definitions to service_role;
grant select, insert, update, delete on public.mandate_capability_definitions to service_role;
grant select, insert, update on public.employee_mandates to service_role;
grant select, insert on public.mandate_events to service_role;
grant execute on function public.reject_mandate_event_mutation() to service_role;
grant execute on function public.actor_has_process_mandate(uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.assert_actor_process_mandate(uuid,text,text,text,text) to service_role;
grant execute on function public.transition_handoff_authorized(uuid,text,text,jsonb,uuid,text,text) to service_role;

-- No employee mandate assignments are seeded. Organisational authority must be explicitly decided.
commit;
