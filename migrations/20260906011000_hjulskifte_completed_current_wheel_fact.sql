begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A verified completed HJULSKIFTE is a later source of current wheel truth.
-- Historical STATUS/CHECK-IN/NYBIL facts remain unchanged; this only changes the read contract.
create or replace function public.get_current_wheel_fact(p_regnr text)
returns table (
  regnr text,
  wheel_type text,
  verified_at timestamptz,
  source_system text,
  source_entity text,
  source_record_id text
)
language sql
security invoker
set search_path = pg_catalog
as $$
  with normalized as (
    select upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g')) as regnr
  ),
  sources as (
    select
      upper(regexp_replace(w.regnr, '\s+', '', 'g')) as regnr,
      nullif(trim(w.target_wheel_type), '') as wheel_type,
      w.completed_at as verified_at,
      'HJULSKIFTE'::text as source_system,
      'garage_wheel_changes'::text as source_entity,
      w.wheel_change_id::text as source_record_id,
      4 as source_rank
    from public.garage_wheel_changes w, normalized n
    where upper(regexp_replace(w.regnr, '\s+', '', 'g')) = n.regnr
      and w.status = 'KLAR'
      and w.completed_at is not null
      and w.target_wheel_type in ('Vinterdäck', 'Sommardäck')

    union all

    select
      upper(regexp_replace(e.regnr, '\s+', '', 'g')),
      nullif(trim(e.new_value), ''),
      e.edited_at,
      'STATUS',
      'vehicle_edits',
      e.id::text,
      3
    from public.vehicle_edits e, normalized n
    where upper(regexp_replace(e.regnr, '\s+', '', 'g')) = n.regnr
      and e.field_name = 'hjultyp'
      and nullif(trim(e.new_value), '') is not null

    union all

    select
      upper(regexp_replace(c.regnr, '\s+', '', 'g')),
      nullif(trim(c.hjultyp), ''),
      c.completed_at,
      'CHECKIN',
      'checkins',
      c.id::text,
      2
    from public.checkins c, normalized n
    where upper(regexp_replace(c.regnr, '\s+', '', 'g')) = n.regnr
      and c.status = 'COMPLETED'
      and c.completed_at is not null
      and nullif(trim(c.hjultyp), '') is not null

    union all

    select
      upper(regexp_replace(ny.regnr, '\s+', '', 'g')),
      nullif(trim(ny.hjultyp), ''),
      ny.created_at,
      'NYBIL',
      'nybil_inventering',
      ny.id::text,
      1
    from public.nybil_inventering ny, normalized n
    where upper(regexp_replace(ny.regnr, '\s+', '', 'g')) = n.regnr
      and nullif(trim(ny.hjultyp), '') is not null
  )
  select s.regnr, s.wheel_type, s.verified_at, s.source_system, s.source_entity, s.source_record_id
  from sources s
  order by s.verified_at desc nulls last, s.source_rank desc
  limit 1;
$$;

revoke all on function public.get_current_wheel_fact(text) from public, anon, authenticated;
grant execute on function public.get_current_wheel_fact(text) to service_role;

create or replace function public.get_wheel_change_candidate_source()
returns table (
  regnr text,
  current_wheel_type text,
  latest_checkin_at timestamptz,
  current_city text,
  current_station text,
  current_saludatum date
)
language sql
security invoker
set search_path = pg_catalog
as $$
  with latest_checkin as (
    select distinct on (upper(regexp_replace(c.regnr, '\s+', '', 'g')))
      upper(regexp_replace(c.regnr, '\s+', '', 'g')) as regnr,
      c.completed_at as verified_at,
      coalesce(nullif(trim(c.current_city), ''), nullif(trim(c.city), '')) as current_city,
      coalesce(nullif(trim(c.current_station), ''), nullif(trim(c.station), '')) as current_station
    from public.checkins c
    where c.regnr is not null
      and length(trim(c.regnr)) > 0
      and c.completed_at is not null
      and c.status = 'COMPLETED'
    order by upper(regexp_replace(c.regnr, '\s+', '', 'g')), c.completed_at desc
  ),
  latest_nybil as (
    select distinct on (upper(regexp_replace(n.regnr, '\s+', '', 'g')))
      upper(regexp_replace(n.regnr, '\s+', '', 'g')) as regnr,
      nullif(trim(n.plats_aktuell_ort), '') as current_city,
      nullif(trim(n.plats_aktuell_station), '') as current_station
    from public.nybil_inventering n
    where n.regnr is not null
      and length(trim(n.regnr)) > 0
    order by upper(regexp_replace(n.regnr, '\s+', '', 'g')), n.created_at desc
  ),
  candidate_regnrs as (
    select regnr from latest_checkin
    union
    select regnr from latest_nybil
  )
  select
    u.regnr,
    f.wheel_type as current_wheel_type,
    c.verified_at as latest_checkin_at,
    coalesce(c.current_city, n.current_city) as current_city,
    coalesce(c.current_station, n.current_station) as current_station,
    s.current_saludatum
  from candidate_regnrs u
  left join lateral public.get_current_wheel_fact(u.regnr) f on true
  left join latest_checkin c on c.regnr = u.regnr
  left join latest_nybil n on n.regnr = u.regnr
  left join public.salu_vehicle_state s
    on upper(regexp_replace(s.regnr, '\s+', '', 'g')) = u.regnr;
$$;

revoke all on function public.get_wheel_change_candidate_source() from public, anon, authenticated;
grant execute on function public.get_wheel_change_candidate_source() to service_role;

commit;
