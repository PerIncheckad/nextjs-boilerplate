begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.garage_items
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid,
  add column if not exists completion_event_id uuid;

alter table public.garage_items
  drop constraint if exists garage_items_completion_state_check;

alter table public.garage_items
  add constraint garage_items_completion_state_check
  check (
    (completed_at is null and completed_by is null and completion_event_id is null)
    or
    (completed_at is not null and completed_by is not null and completion_event_id is not null)
  );

create table public.garage_avveckla_cases (
  avveckla_case_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  regnr text not null check (length(trim(regnr)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'COMPLETED')),
  started_at timestamptz not null default now(),
  started_by uuid not null,
  started_by_email text,
  completed_at timestamptz,
  completed_by uuid,
  completion_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (garage_item_id),
  check (
    (status = 'OPEN' and completed_at is null and completed_by is null and completion_event_id is null)
    or
    (status = 'COMPLETED' and completed_at is not null and completed_by is not null and completion_event_id is not null)
  )
);

create table public.garage_avveckla_points (
  point_id uuid primary key default gen_random_uuid(),
  avveckla_case_id uuid not null references public.garage_avveckla_cases(avveckla_case_id) on delete restrict,
  point_kind text not null default 'STANDARD'
    check (point_kind in ('STANDARD', 'OVRIGT')),
  title text not null check (length(trim(title)) between 1 and 240),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'CLOSED')),
  outcome_code text,
  outcome_comment text,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  created_by_email text,
  completed_at timestamptz,
  completed_by uuid,
  completed_by_email text,
  updated_at timestamptz not null default now(),
  check (
    status = 'OPEN'
    or (
      status = 'CLOSED'
      and length(trim(coalesce(outcome_code, ''))) > 0
      and completed_at is not null
      and completed_by is not null
    )
  ),
  check (status = 'CLOSED' or (outcome_code is null and outcome_comment is null and completed_at is null and completed_by is null and completed_by_email is null))
);

create table public.garage_avveckla_events (
  event_id uuid primary key default gen_random_uuid(),
  avveckla_case_id uuid not null references public.garage_avveckla_cases(avveckla_case_id) on delete restrict,
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  regnr text not null check (length(trim(regnr)) > 0),
  point_id uuid references public.garage_avveckla_points(point_id) on delete restrict,
  event_type text not null check (event_type in (
    'AVVECKLA_STARTED',
    'AVVECKLA_POINT_CREATED',
    'AVVECKLA_POINT_CLOSED',
    'UT_OVERLAMNING_VERIFIERAD',
    'UT_TRANSPORTOR_HAMTAT_VERIFIERAD',
    'UT_AVSTALLNING_VERIFIERAD'
  )),
  event_key text not null unique,
  occurred_at timestamptz not null default now(),
  actor_id uuid not null,
  actor_email text,
  actor_source text not null default 'MANUELL'
    check (actor_source in ('SYSTEM', 'MANUELL', 'EXTERNAL')),
  evidence_reference text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);

alter table public.garage_avveckla_cases
  add constraint garage_avveckla_cases_completion_event_fkey
  foreign key (completion_event_id)
  references public.garage_avveckla_events(event_id)
  on delete restrict;

alter table public.garage_items
  add constraint garage_items_completion_event_id_fkey
  foreign key (completion_event_id)
  references public.garage_avveckla_events(event_id)
  on delete restrict;

create index garage_avveckla_cases_regnr_status_idx
  on public.garage_avveckla_cases (upper(regnr), status, started_at desc);

create index garage_avveckla_points_case_status_idx
  on public.garage_avveckla_points (avveckla_case_id, status, created_at);

create index garage_avveckla_events_case_time_idx
  on public.garage_avveckla_events (avveckla_case_id, occurred_at desc);

create index garage_avveckla_events_regnr_time_idx
  on public.garage_avveckla_events (upper(regnr), occurred_at desc);

create or replace function public.reject_garage_avveckla_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'garage_avveckla_events is append-only; write a new event instead';
end;
$$;

create trigger garage_avveckla_events_append_only_update
before update on public.garage_avveckla_events
for each row execute function public.reject_garage_avveckla_event_mutation();

create trigger garage_avveckla_events_append_only_delete
before delete on public.garage_avveckla_events
for each row execute function public.reject_garage_avveckla_event_mutation();

create or replace function public.guard_completed_garage_item()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if old.completed_at is not null and new is distinct from old then
    raise exception 'Avslutat Garage-objekt är fryst';
  end if;
  return new;
end;
$$;

create trigger garage_items_completed_freeze
before update on public.garage_items
for each row execute function public.guard_completed_garage_item();

create or replace function public.start_garage_avveckla_case(
  p_garage_item_id uuid,
  p_reason text,
  p_actor uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.garage_items%rowtype;
  v_case public.garage_avveckla_cases%rowtype;
  v_event_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if p_actor is null then
    raise exception 'Aktör krävs' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Orsak krävs' using errcode = '22023';
  end if;

  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage-objektet finns inte' using errcode = 'P0002';
  end if;
  if v_item.voided_at is not null then
    raise exception 'Makulerat Garage-objekt kan inte starta AVVECKLA' using errcode = 'P0001';
  end if;
  if v_item.handed_off_nybil_id is not null then
    raise exception 'Garage-objektet är redan överlämnat till Ny bil' using errcode = 'P0001';
  end if;
  if v_item.completed_at is not null then
    raise exception 'Garage-objektet är redan avslutat' using errcode = 'P0001';
  end if;
  if v_item.garage_direction <> 'UT' then
    raise exception 'AVVECKLA kan bara startas för Garage-riktning UT' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(v_item.regnr, '')), '') is null then
    raise exception 'AVVECKLA kräver registreringsnummer' using errcode = 'P0001';
  end if;

  select * into v_case
  from public.garage_avveckla_cases
  where garage_item_id = p_garage_item_id;

  if found then
    return to_jsonb(v_case);
  end if;

  insert into public.garage_avveckla_cases (
    garage_item_id,
    regnr,
    reason,
    started_by,
    started_by_email
  ) values (
    p_garage_item_id,
    upper(regexp_replace(v_item.regnr, '\s+', '', 'g')),
    v_reason,
    p_actor,
    nullif(trim(coalesce(p_actor_email, '')), '')
  )
  returning * into v_case;

  insert into public.garage_avveckla_events (
    avveckla_case_id,
    garage_item_id,
    regnr,
    event_type,
    event_key,
    actor_id,
    actor_email,
    actor_source,
    payload
  ) values (
    v_case.avveckla_case_id,
    p_garage_item_id,
    v_case.regnr,
    'AVVECKLA_STARTED',
    'garage-avveckla:' || v_case.avveckla_case_id::text || ':STARTED',
    p_actor,
    nullif(trim(coalesce(p_actor_email, '')), ''),
    'MANUELL',
    jsonb_build_object('reason', v_reason)
  ) returning event_id into v_event_id;

  return jsonb_build_object('case', to_jsonb(v_case), 'event_id', v_event_id);
end;
$$;

create or replace function public.add_garage_avveckla_point(
  p_avveckla_case_id uuid,
  p_title text,
  p_point_kind text,
  p_actor uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_case public.garage_avveckla_cases%rowtype;
  v_point public.garage_avveckla_points%rowtype;
  v_kind text := upper(trim(coalesce(p_point_kind, 'STANDARD')));
  v_title text := nullif(trim(coalesce(p_title, '')), '');
begin
  if p_actor is null then raise exception 'Aktör krävs' using errcode = '22023'; end if;
  if v_title is null then raise exception 'AVVECKLA-punkt kräver titel' using errcode = '22023'; end if;
  if v_kind not in ('STANDARD', 'OVRIGT') then raise exception 'Ogiltig punkttyp' using errcode = '22023'; end if;

  select * into v_case
  from public.garage_avveckla_cases
  where avveckla_case_id = p_avveckla_case_id
  for update;

  if not found then raise exception 'AVVECKLA-ärendet finns inte' using errcode = 'P0002'; end if;
  if v_case.status <> 'OPEN' then raise exception 'Avslutat AVVECKLA-ärende är fryst' using errcode = 'P0001'; end if;

  insert into public.garage_avveckla_points (
    avveckla_case_id,
    point_kind,
    title,
    created_by,
    created_by_email
  ) values (
    p_avveckla_case_id,
    v_kind,
    v_title,
    p_actor,
    nullif(trim(coalesce(p_actor_email, '')), '')
  ) returning * into v_point;

  insert into public.garage_avveckla_events (
    avveckla_case_id,
    garage_item_id,
    regnr,
    point_id,
    event_type,
    event_key,
    actor_id,
    actor_email,
    actor_source,
    payload
  ) values (
    v_case.avveckla_case_id,
    v_case.garage_item_id,
    v_case.regnr,
    v_point.point_id,
    'AVVECKLA_POINT_CREATED',
    'garage-avveckla-point:' || v_point.point_id::text || ':CREATED',
    p_actor,
    nullif(trim(coalesce(p_actor_email, '')), ''),
    'MANUELL',
    jsonb_build_object('title', v_point.title, 'pointKind', v_point.point_kind)
  );

  return to_jsonb(v_point);
end;
$$;

create or replace function public.close_garage_avveckla_point(
  p_point_id uuid,
  p_outcome_code text,
  p_outcome_comment text,
  p_actor uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_point public.garage_avveckla_points%rowtype;
  v_case public.garage_avveckla_cases%rowtype;
  v_outcome text := upper(trim(coalesce(p_outcome_code, '')));
  v_now timestamptz := clock_timestamp();
begin
  if p_actor is null then raise exception 'Aktör krävs' using errcode = '22023'; end if;
  if length(v_outcome) = 0 then raise exception 'Strukturerat utfall krävs' using errcode = '22023'; end if;
  if v_outcome !~ '^[A-Z0-9_ÅÄÖ-]{1,80}$' then raise exception 'Ogiltigt utfallskodformat' using errcode = '22023'; end if;

  select * into v_point
  from public.garage_avveckla_points
  where point_id = p_point_id
  for update;

  if not found then raise exception 'AVVECKLA-punkten finns inte' using errcode = 'P0002'; end if;
  if v_point.status = 'CLOSED' then return to_jsonb(v_point); end if;

  select * into v_case
  from public.garage_avveckla_cases
  where avveckla_case_id = v_point.avveckla_case_id
  for update;

  if v_case.status <> 'OPEN' then raise exception 'Avslutat AVVECKLA-ärende är fryst' using errcode = 'P0001'; end if;

  update public.garage_avveckla_points
  set status = 'CLOSED',
      outcome_code = v_outcome,
      outcome_comment = nullif(trim(coalesce(p_outcome_comment, '')), ''),
      completed_at = v_now,
      completed_by = p_actor,
      completed_by_email = nullif(trim(coalesce(p_actor_email, '')), ''),
      updated_at = v_now
  where point_id = p_point_id
  returning * into v_point;

  insert into public.garage_avveckla_events (
    avveckla_case_id,
    garage_item_id,
    regnr,
    point_id,
    event_type,
    event_key,
    occurred_at,
    actor_id,
    actor_email,
    actor_source,
    payload
  ) values (
    v_case.avveckla_case_id,
    v_case.garage_item_id,
    v_case.regnr,
    v_point.point_id,
    'AVVECKLA_POINT_CLOSED',
    'garage-avveckla-point:' || v_point.point_id::text || ':CLOSED',
    v_now,
    p_actor,
    nullif(trim(coalesce(p_actor_email, '')), ''),
    'MANUELL',
    jsonb_build_object(
      'title', v_point.title,
      'pointKind', v_point.point_kind,
      'outcomeCode', v_point.outcome_code,
      'outcomeComment', v_point.outcome_comment
    )
  );

  return to_jsonb(v_point);
end;
$$;

create or replace function public.assert_garage_avveckla_ready_for_completion(
  p_garage_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_case public.garage_avveckla_cases%rowtype;
  v_open_count integer;
begin
  select * into v_case
  from public.garage_avveckla_cases
  where garage_item_id = p_garage_item_id
  for update;

  if not found then raise exception 'AVVECKLA-ärende saknas' using errcode = 'P0002'; end if;
  if v_case.status <> 'OPEN' then raise exception 'AVVECKLA-ärendet är redan avslutat' using errcode = 'P0001'; end if;

  select count(*) into v_open_count
  from public.garage_avveckla_points
  where avveckla_case_id = v_case.avveckla_case_id
    and status = 'OPEN';

  if v_open_count > 0 then
    raise exception 'UT kan inte verifieras: % AVVECKLA-punkt(er) är fortfarande ÖPPEN', v_open_count
      using errcode = 'P0001';
  end if;

  return v_case.avveckla_case_id;
end;
$$;

alter table public.garage_avveckla_cases enable row level security;
alter table public.garage_avveckla_points enable row level security;
alter table public.garage_avveckla_events enable row level security;

revoke all on public.garage_avveckla_cases from public, anon, authenticated;
revoke all on public.garage_avveckla_points from public, anon, authenticated;
revoke all on public.garage_avveckla_events from public, anon, authenticated;

revoke all on function public.reject_garage_avveckla_event_mutation() from public, anon, authenticated;
revoke all on function public.guard_completed_garage_item() from public, anon, authenticated;
revoke all on function public.start_garage_avveckla_case(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.add_garage_avveckla_point(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.close_garage_avveckla_point(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.assert_garage_avveckla_ready_for_completion(uuid) from public, anon, authenticated;

grant select, insert, update on public.garage_avveckla_cases to service_role;
grant select, insert, update on public.garage_avveckla_points to service_role;
grant select, insert on public.garage_avveckla_events to service_role;

grant execute on function public.reject_garage_avveckla_event_mutation() to service_role;
grant execute on function public.guard_completed_garage_item() to service_role;
grant execute on function public.start_garage_avveckla_case(uuid, text, uuid, text) to service_role;
grant execute on function public.add_garage_avveckla_point(uuid, text, text, uuid, text) to service_role;
grant execute on function public.close_garage_avveckla_point(uuid, text, text, uuid, text) to service_role;
grant execute on function public.assert_garage_avveckla_ready_for_completion(uuid) to service_role;

comment on table public.garage_avveckla_cases is
  'Manuellt startad AVVECKLA-arbetsprocess för exakt Garage-episod. Terminal UT byggs separat men måste passera point-gaten.';
comment on table public.garage_avveckla_points is
  'AVVECKLA-punkter. Varje punkt måste lämna OPEN genom explicit avslut med strukturerat utfall; OVRIGT tillåter egna punkter.';
comment on table public.garage_avveckla_events is
  'Append-only verksamhetshistorik för AVVECKLA och senare verifierade UT-händelser.';
comment on column public.garage_items.completed_at is
  'Lyckad terminal för exakt Garage-episod. Skild från voided_at som endast betyder makulering.';

commit;
