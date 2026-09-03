begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.guard_garage_avveckla_terminal_timestamp()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.event_type in (
    'UT_OVERLAMNING_VERIFIERAD',
    'UT_TRANSPORTOR_HAMTAT_VERIFIERAD',
    'UT_AVSTALLNING_VERIFIERAD'
  ) and new.occurred_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'Verifierad UT-tidpunkt kan inte ligga i framtiden' using errcode = '22007';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_garage_avveckla_terminal_timestamp on public.garage_avveckla_events;
create trigger trg_guard_garage_avveckla_terminal_timestamp
before insert on public.garage_avveckla_events
for each row execute function public.guard_garage_avveckla_terminal_timestamp();

create or replace function public.guard_garage_avveckla_transport_booking_timestamp()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.booked_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'Verklig transportbokningstid kan inte ligga i framtiden' using errcode = '22007';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_garage_avveckla_transport_booking_timestamp on public.garage_avveckla_transport_bookings;
create trigger trg_guard_garage_avveckla_transport_booking_timestamp
before insert on public.garage_avveckla_transport_bookings
for each row execute function public.guard_garage_avveckla_transport_booking_timestamp();

comment on function public.guard_garage_avveckla_terminal_timestamp() is
  'DB-level guard against future terminal AVVECKLA facts. Complements API timezone normalization.';
comment on function public.guard_garage_avveckla_transport_booking_timestamp() is
  'DB-level guard against future transport booking facts. Complements API timezone normalization.';

commit;
