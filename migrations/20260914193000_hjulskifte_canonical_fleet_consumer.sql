begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Hjulskifte consumer cutover: canonical fleet membership is the only fleet denominator.
-- Wheel truth, season classification and historical campaign evidence remain unchanged.
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
  with latest_bootstrap as (
    select
      b.scope,
      b.coverage_mode,
      b.verified,
      b.complete_active_population_attested,
      b.application_id,
      b.bootstrap_denominator_eligible,
      b.unresolved_count
    from public.fleet_membership_bootstrap_batch_status b
    order by b.t0 desc, b.batch_id desc
    limit 1
  ),
  healthy_bootstrap as (
    select 1
    from latest_bootstrap b
    where b.scope = 'OWN_FLEET'
      and b.coverage_mode = 'COMPLETE_ACTIVE_POPULATION'
      and b.verified = true
      and b.complete_active_population_attested = true
      and b.application_id is not null
      and b.bootstrap_denominator_eligible = true
      and b.unresolved_count = 0
  ),
  active_identities as (
    select m.identity_id
    from public.fleet_membership_current_by_identity m
    join public.fleet_vehicle_identities i on i.identity_id = m.identity_id
    where m.membership_state = 'ACTIVE'
      and m.resolution_reason = 'RESOLVED'
      and i.identity_scope = 'OWN_FLEET'
      and exists (select 1 from healthy_bootstrap)
  ),
  unique_regnr_aliases as (
    select
      a.identity_id,
      max(upper(regexp_replace(a.alias_value, '\s+', '', 'g'))) as regnr
    from public.fleet_vehicle_identity_aliases a
    join active_identities i on i.identity_id = a.identity_id
    where a.alias_type = 'REGNR'
      and nullif(trim(a.alias_value), '') is not null
    group by a.identity_id
    having count(*) = 1
       and count(distinct upper(regexp_replace(a.alias_value, '\s+', '', 'g'))) = 1
  ),
  candidate_regnrs as (
    select a.regnr
    from unique_regnr_aliases a
  ),
  latest_checkin as (
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
