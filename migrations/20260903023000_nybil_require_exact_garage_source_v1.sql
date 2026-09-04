begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- New Nybil registrations must always originate from one exact, current Garage IN row.
-- Historical Nybil rows are left untouched; this trigger only governs future INSERTs.
create or replace function public.guard_nybil_garage_source_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item public.garage_items%rowtype;
begin
  if new.source_garage_item_id is null then
    raise exception 'Ny bil måste ha exakt Garage-källa';
  end if;

  if new.source_garage_updated_at is null then
    raise exception 'Garage-källans versionsstämpel saknas';
  end if;

  select *
    into v_item
    from public.garage_items
   where garage_item_id = new.source_garage_item_id
   for update;

  if not found then
    raise exception 'Garage item % does not exist', new.source_garage_item_id;
  end if;

  if v_item.voided_at is not null then
    raise exception 'Garage item % is voided', new.source_garage_item_id;
  end if;

  if v_item.garage_direction <> 'IN' then
    raise exception 'Garage item % is not UTVECKLA / IN', new.source_garage_item_id;
  end if;

  if new.regnr is null
     or v_item.regnr is null
     or upper(regexp_replace(v_item.regnr, '\s+', '', 'g'))
        <> upper(regexp_replace(new.regnr, '\s+', '', 'g')) then
    raise exception 'Garage/Nybil regnr mismatch for Garage item %', new.source_garage_item_id;
  end if;

  if v_item.handed_off_nybil_id is not null then
    raise exception 'Garage item % is already handed off to Nybil %', new.source_garage_item_id, v_item.handed_off_nybil_id;
  end if;

  if v_item.updated_at is distinct from new.source_garage_updated_at then
    raise exception 'Garage-källan har ändrats sedan Ny bil hämtade informationen';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_nybil_garage_source_version() from public, anon, authenticated;

drop trigger if exists nybil_garage_source_version_guard on public.nybil_inventering;
create trigger nybil_garage_source_version_guard
before insert on public.nybil_inventering
for each row
execute function public.guard_nybil_garage_source_version();

commit;