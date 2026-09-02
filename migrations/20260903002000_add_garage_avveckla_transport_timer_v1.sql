begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.garage_avveckla_transport_bookings (
  booking_id uuid primary key default gen_random_uuid(),
  avveckla_case_id uuid not null unique references public.garage_avveckla_cases(avveckla_case_id) on delete restrict,
  garage_item_id uuid not null unique references public.garage_items(garage_item_id) on delete restrict,
  regnr text not null,
  booked_at timestamptz not null,
  deadline_at timestamptz not null,
  booked_by uuid not null,
  booked_by_email text,
  booking_reference text,
  picked_up_at timestamptz,
  pickup_event_id uuid references public.garage_avveckla_events(event_id) on delete restrict,
  deviation_at timestamptz,
  alert_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garage_avveckla_transport_deadline_exact check (deadline_at = booked_at + interval '5 days'),
  constraint garage_avveckla_transport_pickup_pair check ((picked_up_at is null) = (pickup_event_id is null)),
  constraint garage_avveckla_transport_alert_pair check ((deviation_at is null) = (alert_at is null))
);

create table if not exists public.garage_avveckla_transport_events (
  transport_event_id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.garage_avveckla_transport_bookings(booking_id) on delete restrict,
  avveckla_case_id uuid not null references public.garage_avveckla_cases(avveckla_case_id) on delete restrict,
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete restrict,
  regnr text not null,
  event_type text not null check (event_type in ('TRANSPORT_BOKAD','TRANSPORT_5_DYGN_OVERSKRIDET')),
  event_key text not null unique,
  occurred_at timestamptz not null,
  actor_id uuid,
  actor_email text,
  actor_source text not null check (actor_source in ('MANUELL','SYSTEM')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists garage_avveckla_transport_due_idx
  on public.garage_avveckla_transport_bookings(deadline_at)
  where picked_up_at is null and deviation_at is null;

alter table public.garage_avveckla_transport_bookings enable row level security;
alter table public.garage_avveckla_transport_events enable row level security;

revoke all on public.garage_avveckla_transport_bookings from anon, authenticated;
revoke all on public.garage_avveckla_transport_events from anon, authenticated;
grant select, insert, update on public.garage_avveckla_transport_bookings to service_role;
grant select, insert on public.garage_avveckla_transport_events to service_role;

create or replace function public.guard_garage_avveckla_transport_booking()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Transportbokning får inte raderas' using errcode = 'P0001';
  end if;

  if new.booking_id is distinct from old.booking_id
     or new.avveckla_case_id is distinct from old.avveckla_case_id
     or new.garage_item_id is distinct from old.garage_item_id
     or new.regnr is distinct from old.regnr
     or new.booked_at is distinct from old.booked_at
     or new.deadline_at is distinct from old.deadline_at
     or new.booked_by is distinct from old.booked_by
     or new.booked_by_email is distinct from old.booked_by_email
     or new.booking_reference is distinct from old.booking_reference
     or new.created_at is distinct from old.created_at then
    raise exception 'Transportbokningens ursprung är fryst' using errcode = 'P0001';
  end if;

  if old.picked_up_at is not null and (new.picked_up_at is distinct from old.picked_up_at or new.pickup_event_id is distinct from old.pickup_event_id) then
    raise exception 'Verifierad transporthämtning är fryst' using errcode = 'P0001';
  end if;

  if old.deviation_at is not null and (new.deviation_at is distinct from old.deviation_at or new.alert_at is distinct from old.alert_at) then
    raise exception 'Transportavvikelse/larm är fryst' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_garage_avveckla_transport_booking on public.garage_avveckla_transport_bookings;
create trigger trg_guard_garage_avveckla_transport_booking
before update or delete on public.garage_avveckla_transport_bookings
for each row execute function public.guard_garage_avveckla_transport_booking();

create or replace function public.reject_garage_avveckla_transport_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Transporthändelser är append-only' using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_reject_garage_avveckla_transport_event_mutation on public.garage_avveckla_transport_events;
create trigger trg_reject_garage_avveckla_transport_event_mutation
before update or delete on public.garage_avveckla_transport_events
for each row execute function public.reject_garage_avveckla_transport_event_mutation();

create or replace function public.book_garage_avveckla_transport(
  p_garage_item_id uuid,
  p_booked_at timestamptz,
  p_booking_reference text,
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
  v_booking public.garage_avveckla_transport_bookings%rowtype;
  v_normalized_regnr text;
begin
  if p_actor is null then raise exception 'Aktör krävs' using errcode = '22023'; end if;
  if p_booked_at is null then raise exception 'Verklig bokningstid krävs' using errcode = '22023'; end if;

  select * into v_item from public.garage_items where garage_item_id = p_garage_item_id for update;
  if not found then raise exception 'Garage-objektet finns inte' using errcode = 'P0002'; end if;
  if v_item.garage_direction <> 'UT' or v_item.voided_at is not null or v_item.completed_at is not null then
    raise exception 'Transport kan endast bokas för aktiv AVVECKLA / UT' using errcode = 'P0001';
  end if;

  select * into v_case
  from public.garage_avveckla_cases
  where garage_item_id = p_garage_item_id and status = 'OPEN'
  for update;
  if not found then raise exception 'Öppet AVVECKLA-ärende krävs före transportbokning' using errcode = 'P0001'; end if;

  v_normalized_regnr := upper(regexp_replace(v_item.regnr, '\s+', '', 'g'));
  if v_case.regnr <> v_normalized_regnr then raise exception 'AVVECKLA/Garage regnr mismatch' using errcode = 'P0001'; end if;

  select * into v_booking from public.garage_avveckla_transport_bookings where avveckla_case_id = v_case.avveckla_case_id;
  if found then
    return jsonb_build_object(
      'booking_id', v_booking.booking_id,
      'booked_at', v_booking.booked_at,
      'deadline_at', v_booking.deadline_at,
      'existing', true
    );
  end if;

  insert into public.garage_avveckla_transport_bookings(
    avveckla_case_id, garage_item_id, regnr, booked_at, deadline_at,
    booked_by, booked_by_email, booking_reference
  ) values (
    v_case.avveckla_case_id, v_item.garage_item_id, v_normalized_regnr,
    p_booked_at, p_booked_at + interval '5 days', p_actor,
    nullif(trim(coalesce(p_actor_email,'')),''), nullif(trim(coalesce(p_booking_reference,'')),'')
  ) returning * into v_booking;

  insert into public.garage_avveckla_transport_events(
    booking_id, avveckla_case_id, garage_item_id, regnr,
    event_type, event_key, occurred_at, actor_id, actor_email, actor_source, payload
  ) values (
    v_booking.booking_id, v_case.avveckla_case_id, v_item.garage_item_id, v_normalized_regnr,
    'TRANSPORT_BOKAD', 'garage-avveckla-transport:' || v_booking.booking_id::text || ':BOOKED',
    p_booked_at, p_actor, nullif(trim(coalesce(p_actor_email,'')),''), 'MANUELL',
    jsonb_build_object(
      'bookingId', v_booking.booking_id,
      'bookedAt', v_booking.booked_at,
      'deadlineAt', v_booking.deadline_at,
      'bookingReference', v_booking.booking_reference
    )
  );

  return jsonb_build_object(
    'booking_id', v_booking.booking_id,
    'booked_at', v_booking.booked_at,
    'deadline_at', v_booking.deadline_at,
    'existing', false
  );
end;
$$;

create or replace function public.run_garage_avveckla_transport_timers(
  p_evaluated_at timestamptz default now(),
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := coalesce(p_evaluated_at, now());
  v_row record;
  v_events jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  for v_row in
    select b.*
    from public.garage_avveckla_transport_bookings b
    join public.garage_avveckla_cases c on c.avveckla_case_id = b.avveckla_case_id
    where b.picked_up_at is null
      and b.deviation_at is null
      and b.deadline_at <= v_now
      and c.status = 'OPEN'
    order by b.deadline_at, b.booking_id
    for update of b skip locked
  loop
    v_count := v_count + 1;
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'bookingId', v_row.booking_id,
      'garageItemId', v_row.garage_item_id,
      'regnr', v_row.regnr,
      'eventType', 'TRANSPORT_5_DYGN_OVERSKRIDET',
      'occurredAt', v_row.deadline_at
    ));

    if p_apply then
      update public.garage_avveckla_transport_bookings
      set deviation_at = v_row.deadline_at,
          alert_at = v_row.deadline_at,
          updated_at = now()
      where booking_id = v_row.booking_id;

      insert into public.garage_avveckla_transport_events(
        booking_id, avveckla_case_id, garage_item_id, regnr,
        event_type, event_key, occurred_at, actor_source, payload
      ) values (
        v_row.booking_id, v_row.avveckla_case_id, v_row.garage_item_id, v_row.regnr,
        'TRANSPORT_5_DYGN_OVERSKRIDET',
        'garage-avveckla-transport:' || v_row.booking_id::text || ':5D_OVERDUE',
        v_row.deadline_at, 'SYSTEM',
        jsonb_build_object(
          'bookingId', v_row.booking_id,
          'bookedAt', v_row.booked_at,
          'deadlineAt', v_row.deadline_at,
          'evaluatedAt', v_now,
          'deviation', true,
          'alert', true
        )
      ) on conflict (event_key) do nothing;
    end if;
  end loop;

  return jsonb_build_object('evaluatedAt', v_now, 'applied', p_apply, 'overdueCount', v_count, 'events', v_events);
end;
$$;

create or replace function public.verify_garage_avveckla_extern_transport(
  p_garage_item_id uuid,
  p_occurred_at timestamptz,
  p_evidence_reference text,
  p_actor uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_booking public.garage_avveckla_transport_bookings%rowtype;
  v_result jsonb;
  v_completion_event_id uuid;
begin
  select * into v_booking
  from public.garage_avveckla_transport_bookings
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Extern transport kräver verifierad TRANSPORT_BOKAD innan faktisk hämtning kan verifieras' using errcode = 'P0001';
  end if;
  if v_booking.picked_up_at is not null then
    raise exception 'Transporthämtningen är redan verifierad' using errcode = 'P0001';
  end if;
  if p_occurred_at < v_booking.booked_at then
    raise exception 'Faktisk hämtning kan inte inträffa före transportbokningen' using errcode = '22007';
  end if;

  v_result := public.complete_garage_avveckla_ut_internal(
    p_garage_item_id,
    'UT_TRANSPORTOR_HAMTAT_VERIFIERAD',
    p_occurred_at,
    p_evidence_reference,
    p_actor,
    p_actor_email
  );

  v_completion_event_id := (v_result ->> 'completion_event_id')::uuid;

  update public.garage_avveckla_transport_bookings
  set picked_up_at = p_occurred_at,
      pickup_event_id = v_completion_event_id,
      updated_at = now()
  where booking_id = v_booking.booking_id;

  return v_result || jsonb_build_object(
    'transport_booking_id', v_booking.booking_id,
    'transport_booked_at', v_booking.booked_at,
    'transport_deadline_at', v_booking.deadline_at
  );
end;
$$;

revoke all on function public.book_garage_avveckla_transport(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;
revoke all on function public.run_garage_avveckla_transport_timers(timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.verify_garage_avveckla_extern_transport(uuid,timestamptz,text,uuid,text) from public, anon, authenticated;
grant execute on function public.book_garage_avveckla_transport(uuid,timestamptz,text,uuid,text) to service_role;
grant execute on function public.run_garage_avveckla_transport_timers(timestamptz,boolean) to service_role;
grant execute on function public.verify_garage_avveckla_extern_transport(uuid,timestamptz,text,uuid,text) to service_role;

comment on table public.garage_avveckla_transport_bookings is
  'Frozen external-transport booking fact for one AVVECKLA case. Deadline is exactly booked_at + 5 days.';
comment on function public.run_garage_avveckla_transport_timers(timestamptz,boolean) is
  'Idempotent/concurrency-safe 5-day timer runner. Future-only; overdue creates AVVIKELSE + LARM state and append-only event.';

commit;
