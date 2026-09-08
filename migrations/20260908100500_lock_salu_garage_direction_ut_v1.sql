begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Source-owned invariant: a Garage row materialized from an exact SALU cycle
-- remains AVVECKLA / UT. Garage may continue downstream work, but a generic
-- direction edit must not rewrite the meaning of the verified SALU handoff.
alter table public.garage_items
  add constraint garage_items_salu_source_direction_ut_chk
  check (
    not (source_kind = 'SALU' and source_salu_flag_id is not null)
    or garage_direction is not distinct from 'UT'
  );

create or replace function public.change_garage_direction(
  p_garage_item_id uuid,
  p_to_direction text,
  p_reason text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.garage_items%rowtype;
  v_from text;
  v_to text := upper(trim(coalesce(p_to_direction,'')));
begin
  if v_to not in ('IN','UT') then
    raise exception 'Garage direction must be IN or UT' using errcode = '22023';
  end if;

  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage item not found' using errcode = 'P0002';
  end if;

  if v_item.handed_off_nybil_id is not null then
    raise exception 'Garage-objektet är mottaget i Ny bil och är fryst';
  end if;

  if v_item.source_kind = 'SALU'
     and v_item.source_salu_flag_id is not null
     and v_to is distinct from 'UT' then
    raise exception 'SALU-källat Garage-objekt är source-owned AVVECKLA / UT och kan inte ändras till IN'
      using errcode = 'P0001';
  end if;

  v_from := v_item.garage_direction;
  if v_from is not distinct from v_to then
    return to_jsonb(v_item);
  end if;

  update public.garage_items
  set garage_direction = v_to,
      updated_at = now(),
      updated_by = p_actor
  where garage_item_id = p_garage_item_id
  returning * into v_item;

  insert into public.garage_direction_events(
    garage_item_id,
    from_direction,
    to_direction,
    reason,
    changed_at,
    changed_by
  ) values (
    p_garage_item_id,
    v_from,
    v_to,
    nullif(trim(coalesce(p_reason,'')),''),
    now(),
    p_actor
  );

  return to_jsonb(v_item);
end;
$$;

commit;
