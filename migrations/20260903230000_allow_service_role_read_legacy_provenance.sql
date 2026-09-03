begin;

grant select on table public.vehicle_legacy_current_state_entries to service_role;
revoke all on table public.vehicle_legacy_current_state_entries from anon, authenticated;

comment on table public.vehicle_legacy_current_state_entries is
  'Immutable LEGACY current-state provenance. Server-readable for authenticated API/read-model checks; never client-writable and not historical backfill.';

commit;
