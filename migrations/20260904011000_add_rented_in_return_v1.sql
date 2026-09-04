begin;

create table public.vehicle_rented_in_returns (
  return_id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.vehicle_rented_in_quick_intakes(intake_id),
  regnr text not null,
  normalized_regnr text not null,
  return_type text not null check (return_type = 'RETURN_TO_EXTERNAL_PARTY'),
  return_station text not null check (length(trim(return_station)) > 0),
  returned_to text not null check (length(trim(returned_to)) > 0),
  odometer_km integer not null check (odometer_km >= 0),
  damages_at_return text not null check (length(trim(damages_at_return)) > 0),
  energy_type text not null check (energy_type in ('FUEL','ELECTRIC','NOT_APPLICABLE')),
  energy_level_percent smallint null check (energy_level_percent between 0 and 100),
  returned_at timestamptz not null,
  returned_by uuid not null,
  returned_by_email text not null check (length(trim(returned_by_email)) > 0),
  historical_backfill boolean not null default false check (historical_backfill = false),
  created_at timestamptz not null default now(),
  unique (intake_id),
  unique (normalized_regnr),
  check (regnr = normalized_regnr),
  check (normalized_regnr = upper(regexp_replace(regnr, '\s+', '', 'g'))),
  check ((energy_type = 'NOT_APPLICABLE' and energy_level_percent is null) or (energy_type in ('FUEL','ELECTRIC') and energy_level_percent is not null))
);

alter table public.vehicle_rented_in_returns enable row level security;
revoke all on public.vehicle_rented_in_returns from public, anon, authenticated, service_role;
grant select on public.vehicle_rented_in_returns to service_role;

create or replace function public.reject_vehicle_rented_in_return_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'INHYRD return provenance is immutable' using errcode = 'P0001';
end;
$$;

revoke all on function public.reject_vehicle_rented_in_return_mutation() from public, anon, authenticated, service_role;

create trigger vehicle_rented_in_returns_no_update
before update on public.vehicle_rented_in_returns
for each row execute function public.reject_vehicle_rented_in_return_mutation();

create trigger vehicle_rented_in_returns_no_delete
before delete on public.vehicle_rented_in_returns
for each row execute function public.reject_vehicle_rented_in_return_mutation();

create or replace function public.register_rented_in_vehicle_return(
  p_regnr text,
  p_return_station text,
  p_returned_to text,
  p_odometer_km integer,
  p_damages_at_return text,
  p_energy_type text,
  p_energy_level_percent smallint,
  p_actor_id uuid,
  p_actor_email text
)
returns public.vehicle_rented_in_returns
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_regnr text := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));
  v_station text := nullif(trim(coalesce(p_return_station, '')), '');
  v_returned_to text := nullif(trim(coalesce(p_returned_to, '')), '');
  v_damages text := nullif(trim(coalesce(p_damages_at_return, '')), '');
  v_energy_type text := upper(trim(coalesce(p_energy_type, '')));
  v_actor_email text := nullif(lower(trim(coalesce(p_actor_email, ''))), '');
  v_returned_at timestamptz := clock_timestamp();
  v_intake public.vehicle_rented_in_quick_intakes%rowtype;
  v_return public.vehicle_rented_in_returns%rowtype;
begin
  if v_regnr !~ '^[A-Z]{3}[0-9]{2}[0-9A-Z]$' then raise exception 'Invalid regnr' using errcode='22023'; end if;
  if v_station is null then raise exception 'Return station is required' using errcode='22023'; end if;
  if v_returned_to is null then raise exception 'Returned-to party is required' using errcode='22023'; end if;
  if p_odometer_km is null or p_odometer_km < 0 then raise exception 'Odometer km must be zero or greater' using errcode='22023'; end if;
  if v_damages is null then raise exception 'Damages at return must be explicitly recorded, including none known' using errcode='22023'; end if;
  if v_energy_type not in ('FUEL','ELECTRIC','NOT_APPLICABLE') then raise exception 'Invalid energy type' using errcode='22023'; end if;
  if (v_energy_type = 'NOT_APPLICABLE' and p_energy_level_percent is not null)
     or (v_energy_type in ('FUEL','ELECTRIC') and (p_energy_level_percent is null or p_energy_level_percent < 0 or p_energy_level_percent > 100)) then
    raise exception 'Energy level must match energy type' using errcode='22023';
  end if;
  if p_actor_id is null or v_actor_email is null then raise exception 'Returned actor is required' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtext('vehicle-rented-in-return:' || v_regnr));

  select * into v_intake
  from public.vehicle_rented_in_quick_intakes
  where normalized_regnr = v_regnr
  for update;

  if not found then raise exception 'Active INHYRD intake not found' using errcode='P0002'; end if;

  if exists (select 1 from public.vehicle_rented_in_returns where intake_id = v_intake.intake_id) then
    raise exception 'INHYRD return already exists for vehicle' using errcode='P0001';
  end if;

  if p_odometer_km < v_intake.odometer_km then
    raise exception 'Return odometer cannot be lower than intake odometer' using errcode='22023';
  end if;

  if v_returned_at < v_intake.registered_at then
    raise exception 'Return time cannot precede intake time' using errcode='22023';
  end if;

  if exists (
    select 1 from public.vehicle_journey_periods
    where regnr = v_regnr and ended_at is null
  ) then
    raise exception 'Open Layer 1 period must be closed by its owning source before INHYRD return' using errcode='P0001';
  end if;

  insert into public.vehicle_rented_in_returns (
    intake_id, regnr, normalized_regnr, return_type, return_station, returned_to,
    odometer_km, damages_at_return, energy_type, energy_level_percent,
    returned_at, returned_by, returned_by_email, historical_backfill
  ) values (
    v_intake.intake_id, v_regnr, v_regnr, 'RETURN_TO_EXTERNAL_PARTY', v_station, v_returned_to,
    p_odometer_km, v_damages, v_energy_type, p_energy_level_percent,
    v_returned_at, p_actor_id, v_actor_email, false
  ) returning * into v_return;

  return v_return;
end;
$$;

revoke all on function public.register_rented_in_vehicle_return(text,text,text,integer,text,text,smallint,uuid,text) from public, anon, authenticated;
grant execute on function public.register_rented_in_vehicle_return(text,text,text,integer,text,text,smallint,uuid,text) to service_role;

comment on table public.vehicle_rented_in_returns is
  'Immutable INHYRD return provenance. Ends active INHYRD object presence from DB return time without touching RENTAL source ownership or AVVECKLA.';

commit;
