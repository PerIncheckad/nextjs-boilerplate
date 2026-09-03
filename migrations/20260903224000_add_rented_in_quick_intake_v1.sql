begin;

create table public.vehicle_rented_in_quick_intakes (
  intake_id uuid primary key default gen_random_uuid(),
  regnr text not null,
  normalized_regnr text not null,
  object_type text not null check (object_type = 'INHYRD'),
  brand text not null check (length(trim(brand)) > 0),
  model text not null check (length(trim(model)) > 0),
  odometer_km integer not null check (odometer_km >= 0),
  known_damages text not null check (length(trim(known_damages)) > 0),
  station text not null check (length(trim(station)) > 0),
  intake_method text not null check (intake_method = 'QUICK_INTAKE'),
  registered_at timestamptz not null,
  registered_by uuid not null,
  registered_by_email text not null check (length(trim(registered_by_email)) > 0),
  historical_backfill boolean not null default false check (historical_backfill = false),
  created_at timestamptz not null default now(),
  unique (normalized_regnr),
  check (regnr = normalized_regnr),
  check (normalized_regnr = upper(regexp_replace(regnr, '\s+', '', 'g')))
);

alter table public.vehicle_rented_in_quick_intakes enable row level security;
revoke all on public.vehicle_rented_in_quick_intakes from public, anon, authenticated, service_role;

create or replace function public.reject_vehicle_rented_in_quick_intake_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'INHYRD quick-intake provenance is immutable' using errcode = 'P0001';
end;
$$;

revoke all on function public.reject_vehicle_rented_in_quick_intake_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists vehicle_rented_in_quick_intakes_no_update on public.vehicle_rented_in_quick_intakes;
create trigger vehicle_rented_in_quick_intakes_no_update
before update on public.vehicle_rented_in_quick_intakes
for each row execute function public.reject_vehicle_rented_in_quick_intake_mutation();

drop trigger if exists vehicle_rented_in_quick_intakes_no_delete on public.vehicle_rented_in_quick_intakes;
create trigger vehicle_rented_in_quick_intakes_no_delete
before delete on public.vehicle_rented_in_quick_intakes
for each row execute function public.reject_vehicle_rented_in_quick_intake_mutation();

create or replace function public.register_rented_in_vehicle_quick_intake(
  p_regnr text,
  p_brand text,
  p_model text,
  p_odometer_km integer,
  p_known_damages text,
  p_station text,
  p_actor_id uuid,
  p_actor_email text
)
returns public.vehicle_rented_in_quick_intakes
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  v_brand text := nullif(trim(coalesce(p_brand, '')), '');
  v_model text := nullif(trim(coalesce(p_model, '')), '');
  v_known_damages text := nullif(trim(coalesce(p_known_damages, '')), '');
  v_station text := nullif(trim(coalesce(p_station, '')), '');
  v_actor_email text := nullif(lower(trim(coalesce(p_actor_email, ''))), '');
  v_registered_at timestamptz := clock_timestamp();
  v_row public.vehicle_rented_in_quick_intakes%rowtype;
begin
  if v_regnr !~ '^[A-Z]{3}[0-9]{2}[0-9A-Z]$' then
    raise exception 'Invalid regnr' using errcode = '22023';
  end if;
  if v_brand is null then raise exception 'Brand is required' using errcode = '22023'; end if;
  if v_model is null then raise exception 'Model is required' using errcode = '22023'; end if;
  if p_odometer_km is null or p_odometer_km < 0 then
    raise exception 'Odometer km must be zero or greater' using errcode = '22023';
  end if;
  if v_known_damages is null then
    raise exception 'Known damages must be explicitly recorded, including none known' using errcode = '22023';
  end if;
  if v_station is null then raise exception 'Station is required' using errcode = '22023'; end if;
  if p_actor_id is null or v_actor_email is null then
    raise exception 'Registered actor is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('vehicle-rented-in-quick-intake:' || v_regnr));

  if exists (
    select 1 from public.vehicle_rented_in_quick_intakes where normalized_regnr = v_regnr
  ) then
    raise exception 'INHYRD quick intake already exists for vehicle' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.vehicle_legacy_current_state_entries where normalized_regnr = v_regnr
  ) then
    raise exception 'Vehicle is already classified as LEGACY_FLEET' using errcode = 'P0001';
  end if;

  insert into public.vehicle_rented_in_quick_intakes (
    regnr,
    normalized_regnr,
    object_type,
    brand,
    model,
    odometer_km,
    known_damages,
    station,
    intake_method,
    registered_at,
    registered_by,
    registered_by_email,
    historical_backfill
  ) values (
    v_regnr,
    v_regnr,
    'INHYRD',
    v_brand,
    v_model,
    p_odometer_km,
    v_known_damages,
    v_station,
    'QUICK_INTAKE',
    v_registered_at,
    p_actor_id,
    v_actor_email,
    false
  ) returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.register_rented_in_vehicle_quick_intake(text,text,text,integer,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.register_rented_in_vehicle_quick_intake(text,text,text,integer,text,text,uuid,text)
  to service_role;

comment on table public.vehicle_rented_in_quick_intakes is
  'Immutable INHYRD quick-intake provenance. Records the external vehicle from intake time only and creates no prior history or operational state.';

comment on function public.register_rented_in_vehicle_quick_intake(text,text,text,integer,text,text,uuid,text) is
  'Registers an INHYRD object with DB-generated intake time and server-resolved station/actor. Does not create Layer 1, Nybil, Garage, SALU or historical backfill.';

commit;
