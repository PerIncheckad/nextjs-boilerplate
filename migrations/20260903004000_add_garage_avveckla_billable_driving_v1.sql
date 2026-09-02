begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.billable_driving_events (
  billing_event_id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null unique references public.garage_avveckla_events(event_id) on delete restrict,
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  avveckla_case_id uuid not null references public.garage_avveckla_cases(avveckla_case_id) on delete restrict,
  regnr text not null,
  event_type text not null default 'FAKTURERBAR_KORNING' check (event_type = 'FAKTURERBAR_KORNING'),
  from_location text not null,
  to_location text not null,
  price_class text,
  base_price numeric(12,2),
  price numeric(12,2) not null check (price > 0),
  price_basis text not null check (price_basis in ('ET_MATRIX','OFFERT')),
  price_list_id text not null,
  price_list_version text not null,
  performed_at timestamptz not null,
  performed_by uuid,
  performed_by_email text,
  billing_status text not null default 'EJ_FAKTURERAD' check (billing_status in ('EJ_FAKTURERAD','FAKTURAUNDERLAG','FAKTURERAD')),
  invoice_number text,
  invoiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billable_driving_invoice_pair check (
    (billing_status = 'FAKTURERAD' and invoice_number is not null and invoiced_at is not null)
    or (billing_status <> 'FAKTURERAD' and invoice_number is null and invoiced_at is null)
  ),
  constraint billable_driving_price_basis_shape check (
    (price_basis = 'ET_MATRIX' and price_class is not null and base_price is not null)
    or (price_basis = 'OFFERT' and price_class is null and base_price is null)
  )
);

create table if not exists public.billable_driving_event_history (
  history_id uuid primary key default gen_random_uuid(),
  billing_event_id uuid not null references public.billable_driving_events(billing_event_id) on delete restrict,
  event_type text not null check (event_type in ('CREATED','MOVED_TO_FAKTURAUNDERLAG','FAKTURERAD')),
  event_key text not null unique,
  previous_status text,
  status text not null,
  occurred_at timestamptz not null,
  actor_id uuid,
  actor_email text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists billable_driving_status_idx
  on public.billable_driving_events(billing_status, performed_at, billing_event_id);

alter table public.billable_driving_events enable row level security;
alter table public.billable_driving_event_history enable row level security;
revoke all on public.billable_driving_events from anon, authenticated;
revoke all on public.billable_driving_event_history from anon, authenticated;
grant select, insert, update on public.billable_driving_events to service_role;
grant select, insert on public.billable_driving_event_history to service_role;

create or replace function public.guard_billable_driving_event()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Fakturerbar körning får inte raderas' using errcode = 'P0001';
  end if;

  if new.billing_event_id is distinct from old.billing_event_id
     or new.source_event_id is distinct from old.source_event_id
     or new.garage_item_id is distinct from old.garage_item_id
     or new.avveckla_case_id is distinct from old.avveckla_case_id
     or new.regnr is distinct from old.regnr
     or new.event_type is distinct from old.event_type
     or new.from_location is distinct from old.from_location
     or new.to_location is distinct from old.to_location
     or new.price_class is distinct from old.price_class
     or new.base_price is distinct from old.base_price
     or new.price is distinct from old.price
     or new.price_basis is distinct from old.price_basis
     or new.price_list_id is distinct from old.price_list_id
     or new.price_list_version is distinct from old.price_list_version
     or new.performed_at is distinct from old.performed_at
     or new.performed_by is distinct from old.performed_by
     or new.performed_by_email is distinct from old.performed_by_email
     or new.created_at is distinct from old.created_at then
    raise exception 'Den ekonomiska körningshändelsens affärsfakta är frysta' using errcode = 'P0001';
  end if;

  if old.billing_status = 'FAKTURERAD' and new is distinct from old then
    raise exception 'Fakturerad körning är fryst' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_billable_driving_event on public.billable_driving_events;
create trigger trg_guard_billable_driving_event
before update or delete on public.billable_driving_events
for each row execute function public.guard_billable_driving_event();

create or replace function public.reject_billable_driving_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Ekonomisk körningshistorik är append-only' using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_reject_billable_driving_history_mutation on public.billable_driving_event_history;
create trigger trg_reject_billable_driving_history_mutation
before update or delete on public.billable_driving_event_history
for each row execute function public.reject_billable_driving_history_mutation();

create or replace function public.verify_garage_avveckla_egen_leverans_with_billing(
  p_garage_item_id uuid,
  p_occurred_at timestamptz,
  p_evidence_reference text,
  p_is_billable boolean,
  p_from_location text,
  p_to_location text,
  p_price_class text,
  p_base_price numeric,
  p_price numeric,
  p_price_basis text,
  p_price_list_id text,
  p_price_list_version text,
  p_actor uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_source_event_id uuid;
  v_case_id uuid;
  v_regnr text;
  v_billing_event_id uuid;
begin
  if p_is_billable is null then
    raise exception 'Fakturerbar körning måste anges Ja eller Nej för egen leverans' using errcode = '22023';
  end if;

  if p_is_billable then
    if length(trim(coalesce(p_from_location,''))) = 0 or length(trim(coalesce(p_to_location,''))) = 0 then
      raise exception 'FRÅN och TILL krävs för fakturerbar körning' using errcode = '22023';
    end if;
    if p_price is null or p_price <= 0 then
      raise exception 'Giltigt pris krävs för fakturerbar körning' using errcode = '22023';
    end if;
    if p_price_list_id <> 'ET_PRISLISTA' or p_price_list_version <> '2026-01-29' then
      raise exception 'ET Prislista 2026 måste användas' using errcode = '22023';
    end if;
    if p_price_basis not in ('ET_MATRIX','OFFERT') then
      raise exception 'Ogiltig prisgrund' using errcode = '22023';
    end if;
    if p_price_basis = 'ET_MATRIX' and (p_price_class is null or p_base_price is null) then
      raise exception 'Bilplats och grundpris krävs för ET-matrispris' using errcode = '22023';
    end if;
    if p_price_basis = 'OFFERT' and (p_price_class is not null or p_base_price is not null) then
      raise exception 'OFFERT får inte bära matrisens bilplats/grundpris' using errcode = '22023';
    end if;
  end if;

  v_result := public.complete_garage_avveckla_ut_internal(
    p_garage_item_id,
    'UT_OVERLAMNING_VERIFIERAD',
    p_occurred_at,
    p_evidence_reference,
    p_actor,
    p_actor_email
  );

  if not p_is_billable then
    return v_result || jsonb_build_object('billable_driving', false);
  end if;

  v_source_event_id := (v_result ->> 'completion_event_id')::uuid;
  v_case_id := (v_result ->> 'avveckla_case_id')::uuid;
  v_regnr := v_result ->> 'regnr';

  insert into public.billable_driving_events(
    source_event_id, garage_item_id, avveckla_case_id, regnr,
    from_location, to_location, price_class, base_price, price, price_basis,
    price_list_id, price_list_version, performed_at, performed_by, performed_by_email
  ) values (
    v_source_event_id, p_garage_item_id, v_case_id, v_regnr,
    trim(p_from_location), trim(p_to_location), nullif(trim(coalesce(p_price_class,'')),''),
    p_base_price, p_price, p_price_basis, p_price_list_id, p_price_list_version,
    p_occurred_at, p_actor, nullif(trim(coalesce(p_actor_email,'')),'')
  ) returning billing_event_id into v_billing_event_id;

  insert into public.billable_driving_event_history(
    billing_event_id, event_type, event_key, previous_status, status,
    occurred_at, actor_id, actor_email, payload
  ) values (
    v_billing_event_id, 'CREATED',
    'billable-driving:' || v_billing_event_id::text || ':CREATED',
    null, 'EJ_FAKTURERAD', p_occurred_at, p_actor,
    nullif(trim(coalesce(p_actor_email,'')),''),
    jsonb_build_object(
      'sourceEventId', v_source_event_id,
      'regnr', v_regnr,
      'from', trim(p_from_location),
      'to', trim(p_to_location),
      'priceClass', nullif(trim(coalesce(p_price_class,'')),''),
      'basePrice', p_base_price,
      'price', p_price,
      'priceBasis', p_price_basis,
      'priceListId', p_price_list_id,
      'priceListVersion', p_price_list_version
    )
  );

  return v_result || jsonb_build_object(
    'billable_driving', true,
    'billing_event_id', v_billing_event_id,
    'billing_status', 'EJ_FAKTURERAD'
  );
end;
$$;

create or replace function public.transition_billable_driving_event(
  p_billing_event_id uuid,
  p_target_status text,
  p_invoice_number text,
  p_invoiced_at timestamptz,
  p_actor uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event public.billable_driving_events%rowtype;
  v_event_type text;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor is null then raise exception 'Aktör krävs' using errcode = '22023'; end if;

  select * into v_event
  from public.billable_driving_events
  where billing_event_id = p_billing_event_id
  for update;
  if not found then raise exception 'Fakturerbar körning finns inte' using errcode = 'P0002'; end if;

  if v_event.billing_status = 'EJ_FAKTURERAD' and p_target_status = 'FAKTURAUNDERLAG' then
    v_event_type := 'MOVED_TO_FAKTURAUNDERLAG';
  elsif v_event.billing_status = 'FAKTURAUNDERLAG' and p_target_status = 'FAKTURERAD' then
    if length(trim(coalesce(p_invoice_number,''))) = 0 or p_invoiced_at is null then
      raise exception 'Fakturanummer och fakturadatum krävs' using errcode = '22023';
    end if;
    v_event_type := 'FAKTURERAD';
  else
    raise exception 'Ogiltig faktureringsövergång: % -> %', v_event.billing_status, p_target_status using errcode = 'P0001';
  end if;

  update public.billable_driving_events
  set billing_status = p_target_status,
      invoice_number = case when p_target_status = 'FAKTURERAD' then trim(p_invoice_number) else null end,
      invoiced_at = case when p_target_status = 'FAKTURERAD' then p_invoiced_at else null end,
      updated_at = v_now
  where billing_event_id = p_billing_event_id
  returning * into v_event;

  insert into public.billable_driving_event_history(
    billing_event_id, event_type, event_key, previous_status, status,
    occurred_at, actor_id, actor_email, payload
  ) values (
    v_event.billing_event_id, v_event_type,
    'billable-driving:' || v_event.billing_event_id::text || ':' || p_target_status,
    case when p_target_status = 'FAKTURAUNDERLAG' then 'EJ_FAKTURERAD' else 'FAKTURAUNDERLAG' end,
    p_target_status, coalesce(p_invoiced_at, v_now), p_actor,
    nullif(trim(coalesce(p_actor_email,'')),''),
    jsonb_build_object('invoiceNumber', v_event.invoice_number, 'invoicedAt', v_event.invoiced_at)
  );

  return jsonb_build_object(
    'billing_event_id', v_event.billing_event_id,
    'billing_status', v_event.billing_status,
    'invoice_number', v_event.invoice_number,
    'invoiced_at', v_event.invoiced_at
  );
end;
$$;

revoke all on function public.verify_garage_avveckla_egen_leverans_with_billing(uuid,timestamptz,text,boolean,text,text,text,numeric,numeric,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.transition_billable_driving_event(uuid,text,text,timestamptz,uuid,text) from public, anon, authenticated;
grant execute on function public.verify_garage_avveckla_egen_leverans_with_billing(uuid,timestamptz,text,boolean,text,text,text,numeric,numeric,text,text,text,uuid,text) to service_role;
grant execute on function public.transition_billable_driving_event(uuid,text,text,timestamptz,uuid,text) to service_role;

comment on table public.billable_driving_events is
  'Economic afterlife for verified billable own-delivery events. Business facts and price snapshot survive vehicle UT.';
comment on function public.verify_garage_avveckla_egen_leverans_with_billing(uuid,timestamptz,text,boolean,text,text,text,numeric,numeric,text,text,text,uuid,text) is
  'Atomic own-delivery UT handshake. If billable, creates exactly one FAKTURERBAR_KORNING from the immutable verified UT source event in the same transaction.';

commit;
