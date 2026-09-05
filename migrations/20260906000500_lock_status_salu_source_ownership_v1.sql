begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- STATUS may correct current vehicle facts, but SALU process facts are source-owned.
-- Keep the legacy vehicle_edits table for history; block new parallel SALU truth.
create or replace function public.guard_vehicle_edits_salu_source_ownership()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.field_name in (
    'saludatum',
    'salu_station',
    'salu_kopare',
    'salu_returadress',
    'salu_retur',
    'salu_attention',
    'salu_notering'
  ) then
    raise exception 'SALU-owned field % must be changed in SALU, not STATUS', new.field_name
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists vehicle_edits_salu_source_ownership on public.vehicle_edits;
create trigger vehicle_edits_salu_source_ownership
before insert on public.vehicle_edits
for each row
execute function public.guard_vehicle_edits_salu_source_ownership();

revoke all on function public.guard_vehicle_edits_salu_source_ownership() from public, anon, authenticated;
grant execute on function public.guard_vehicle_edits_salu_source_ownership() to service_role;

commit;
