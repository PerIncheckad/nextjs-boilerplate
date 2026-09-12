begin;

-- COMPLETE_ACTIVE_POPULATION is usable as a bootstrap denominator only when
-- Bilkontroll has explicitly attested completeness and no UNKNOWN/unresolved
-- object remains in the verified T0 manifest. Step 2 never opens consumers.
create or replace view public.fleet_membership_bootstrap_batch_status
with (security_invoker = true)
as
select
  b.batch_id,
  b.batch_key,
  b.revision_no,
  b.t0,
  b.scope,
  b.coverage_mode,
  s.manifest_hash,
  s.revision_hash,
  (s.batch_id is not null) as verified,
  coalesce(s.complete_active_population_attested, false) as complete_active_population_attested,
  a.application_id,
  a.applied_at,
  count(i.item_id) as item_count,
  count(i.item_id) filter (where i.membership_state = 'ACTIVE') as active_count,
  count(i.item_id) filter (where i.membership_state = 'INACTIVE') as inactive_count,
  count(i.item_id) filter (where i.membership_state = 'UNKNOWN') as unknown_count,
  count(i.item_id) filter (where i.identity_id is null) as unresolved_count,
  (
    b.coverage_mode = 'COMPLETE_ACTIVE_POPULATION'
    and coalesce(s.complete_active_population_attested, false)
    and count(i.item_id) filter (where i.membership_state = 'UNKNOWN') = 0
    and count(i.item_id) filter (where i.identity_id is null) = 0
    and a.application_id is not null
  ) as bootstrap_denominator_eligible,
  false as consumer_cutover_ready
from public.fleet_membership_bootstrap_batches b
left join public.fleet_membership_bootstrap_seals s on s.batch_id = b.batch_id
left join public.fleet_membership_bootstrap_applications a on a.batch_id = b.batch_id
left join public.fleet_membership_bootstrap_items i on i.batch_id = b.batch_id
group by b.batch_id, s.batch_id, s.manifest_hash, s.revision_hash, s.complete_active_population_attested, a.application_id, a.applied_at;

revoke all on public.fleet_membership_bootstrap_batch_status from public, anon, authenticated, service_role;
grant select on public.fleet_membership_bootstrap_batch_status to service_role;

comment on view public.fleet_membership_bootstrap_batch_status is 'Bootstrap audit/read status. PARTIAL and any UNKNOWN/unresolved manifest are never denominator-eligible. Step 2 never marks consumer cutover ready.';

commit;
