begin;

grant select on public.vehicle_rented_in_quick_intakes to service_role;

comment on table public.vehicle_rented_in_quick_intakes is
  'Immutable INHYRD quick-intake provenance. Client roles have no direct access; service_role may read for authenticated server APIs and operational classification.';

commit;
