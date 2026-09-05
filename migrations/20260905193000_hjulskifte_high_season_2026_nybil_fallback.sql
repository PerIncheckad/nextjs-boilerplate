begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- High-season 2026 surgical correction:
-- current wheel truth precedence is STATUS -> COMPLETED CHECK-IN -> verified NYBIL baseline -> UNKNOWN.
-- No historical rows are rewritten and no wheel type is inferred.
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
      nullif(trim(c.hjultyp), '') as checkin_wheel_type,
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
      nullif(trim(n.hjultyp), '') as nybil_wheel_type,
      nullif(trim(n.plats_aktuell_ort), '') as current_city,
      nullif(trim(n.plats_aktuell_station), '') as current_station
    from public.nybil_inventering n
    where n.regnr is not null
      and length(trim(n.regnr)) > 0
    order by upper(regexp_replace(n.regnr, '\s+', '', 'g')), n.created_at desc
  ),
  latest_hjultyp_edit as (
    select distinct on (upper(regexp_replace(e.regnr, '\s+', '', 'g')))
      upper(regexp_replace(e.regnr, '\s+', '', 'g')) as regnr,
      nullif(trim(e.new_value), '') as edited_wheel_type
    from public.vehicle_edits e
    where e.field_name = 'hjultyp'
    order by upper(regexp_replace(e.regnr, '\s+', '', 'g')), e.edited_at desc
  ),
  candidate_regnrs as (
    select regnr from latest_checkin
    union
    select regnr from latest_nybil
  )
  select
    u.regnr,
    coalesce(e.edited_wheel_type, c.checkin_wheel_type, n.nybil_wheel_type) as current_wheel_type,
    c.verified_at as latest_checkin_at,
    coalesce(c.current_city, n.current_city) as current_city,
    coalesce(c.current_station, n.current_station) as current_station,
    s.current_saludatum
  from candidate_regnrs u
  left join latest_hjultyp_edit e on e.regnr = u.regnr
  left join latest_checkin c on c.regnr = u.regnr
  left join latest_nybil n on n.regnr = u.regnr
  left join public.salu_vehicle_state s
    on upper(regexp_replace(s.regnr, '\s+', '', 'g')) = u.regnr;
$$;

revoke all on function public.get_wheel_change_candidate_source() from public, anon, authenticated;
grant execute on function public.get_wheel_change_candidate_source() to service_role;

commit;
