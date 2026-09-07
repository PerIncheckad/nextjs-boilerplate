begin;

create or replace function public.guard_nybil_garage_source_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_updated_at timestamptz;
  v_handed_off_nybil_id uuid;
  v_voided_at timestamptz;
begin
  if new.source_garage_item_id is null then
    return new;
  end if;

  if new.source_garage_updated_at is null then
    raise exception 'Garage-källans versionsstämpel saknas';
  end if;

  select updated_at, handed_off_nybil_id, voided_at
    into v_updated_at, v_handed_off_nybil_id, v_voided_at
    from public.garage_items
   where garage_item_id = new.source_garage_item_id
   for update;

  if not found then
    raise exception 'Garage item % does not exist', new.source_garage_item_id;
  end if;

  if v_voided_at is not null then
    raise exception 'Garage item % is voided and cannot be handed off to Nybil', new.source_garage_item_id;
  end if;

  if v_handed_off_nybil_id is not null then
    raise exception 'Garage item % is already handed off to Nybil %', new.source_garage_item_id, v_handed_off_nybil_id;
  end if;

  if v_updated_at is distinct from new.source_garage_updated_at then
    raise exception 'Garage-källan har ändrats sedan Ny bil hämtade informationen';
  end if;

  return new;
end;
$$;

commit;
