begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

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
      c.completed_at as latest_checkin_at,
      coalesce(nullif(trim(c.current_city), ''), nullif(trim(c.city), '')) as current_city,
      coalesce(nullif(trim(c.current_station), ''), nullif(trim(c.station), '')) as current_station
    from public.checkins c
    where c.regnr is not null
      and length(trim(c.regnr)) > 0
      and c.completed_at is not null
      and c.status = 'COMPLETED'
    order by upper(regexp_replace(c.regnr, '\s+', '', 'g')), c.completed_at desc
  ),
  latest_hjultyp_edit as (
    select distinct on (upper(regexp_replace(e.regnr, '\s+', '', 'g')))
      upper(regexp_replace(e.regnr, '\s+', '', 'g')) as regnr,
      nullif(trim(e.new_value), '') as edited_wheel_type
    from public.vehicle_edits e
    where e.field_name = 'hjultyp'
    order by upper(regexp_replace(e.regnr, '\s+', '', 'g')), e.edited_at desc
  )
  select
    l.regnr,
    coalesce(e.edited_wheel_type, l.checkin_wheel_type) as current_wheel_type,
    l.latest_checkin_at,
    l.current_city,
    l.current_station,
    s.current_saludatum
  from latest_checkin l
  left join latest_hjultyp_edit e on e.regnr = l.regnr
  left join public.salu_vehicle_state s
    on upper(regexp_replace(s.regnr, '\s+', '', 'g')) = l.regnr;
$$;

revoke all on function public.get_wheel_change_candidate_source() from public, anon, authenticated;
grant execute on function public.get_wheel_change_candidate_source() to service_role;

commit;
