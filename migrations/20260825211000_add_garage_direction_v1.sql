begin;

alter table public.garage_items
  add column if not exists garage_direction text
  check (garage_direction is null or garage_direction in ('IN','UT'));

comment on column public.garage_items.garage_direction is
  'Explicit Garage direction: IN = UTVECKLA / into or back into operation, UT = AVVECKLA / out of operation. NULL means not yet classified; no direction is inferred from source or reason.';

create table if not exists public.garage_direction_events (
  garage_direction_event_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete cascade,
  from_direction text check (from_direction is null or from_direction in ('IN','UT')),
  to_direction text not null check (to_direction in ('IN','UT')),
  reason text,
  changed_at timestamptz not null default now(),
  changed_by uuid
);

comment on table public.garage_direction_events is
  'Append-only audit of explicit Garage direction changes. Direction changes do not rewrite Layer 1 history.';

create or replace function public.reject_garage_direction_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception 'garage_direction_events is append-only';
end;
$$;

create trigger garage_direction_events_append_only_update
before update on public.garage_direction_events
for each row execute function public.reject_garage_direction_event_mutation();

create trigger garage_direction_events_append_only_delete
before delete on public.garage_direction_events
for each row execute function public.reject_garage_direction_event_mutation();

alter table public.garage_direction_events enable row level security;
revoke all on public.garage_direction_events from anon, authenticated;
grant all on public.garage_direction_events to service_role;
revoke all on function public.reject_garage_direction_event_mutation() from public, anon, authenticated;
grant execute on function public.reject_garage_direction_event_mutation() to service_role;

commit;
