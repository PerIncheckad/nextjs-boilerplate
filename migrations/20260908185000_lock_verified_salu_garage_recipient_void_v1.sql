create or replace function public.is_verified_salu_garage_recipient_v1(
  p_garage_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.garage_items g
    join public.handoffs h
      on h.handoff_code = 'SALU_TO_GARAGE_SALJAS'
     and h.handoff_version = 1
     and h.status = 'VERIFIED'
     and h.source_system = 'SALU'
     and h.source_entity = 'salu_flags'
     and h.source_record_id = g.source_salu_flag_id::text
     and h.source_event_key = 'salu-manual-close:' || g.source_salu_flag_id::text
     and h.metadata ->> 'flagId' = g.source_salu_flag_id::text
     and h.metadata ->> 'garageItemId' = g.garage_item_id::text
    where g.garage_item_id = p_garage_item_id
      and g.source_kind = 'SALU'
      and g.source_salu_flag_id is not null
  );
$$;

revoke all on function public.is_verified_salu_garage_recipient_v1(uuid) from public;
revoke all on function public.is_verified_salu_garage_recipient_v1(uuid) from anon;
revoke all on function public.is_verified_salu_garage_recipient_v1(uuid) from authenticated;
grant execute on function public.is_verified_salu_garage_recipient_v1(uuid) to service_role;

create or replace function public.guard_garage_item_void_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.voided_at is not null and new is distinct from old then
    raise exception 'Makulering av Garage-objekt är permanent';
  end if;

  if old.voided_at is null and new.voided_at is not null then
    if public.is_verified_salu_garage_recipient_v1(old.garage_item_id) then
      raise exception 'Verifierad SALU → Garage-mottagare kan inte makuleras genom generell Garage-makulering'
        using errcode = 'P0001';
    end if;

    if new.voided_by is null or nullif(btrim(new.void_reason), '') is null then
      raise exception 'Makulering kräver aktör och orsak';
    end if;
  elsif old.voided_at is null and new.voided_at is null then
    if new.voided_by is not null or new.void_reason is not null then
      raise exception 'Makulering måste sättas atomiskt';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists garage_items_void_state_guard on public.garage_items;
create trigger garage_items_void_state_guard
before update on public.garage_items
for each row execute function public.guard_garage_item_void_state();

create or replace function public.void_garage_item(
  p_garage_item_id uuid,
  p_reason text,
  p_actor uuid
)
returns public.garage_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.garage_items;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if p_actor is null then
    raise exception 'Aktör krävs';
  end if;
  if v_reason is null then
    raise exception 'Orsak krävs';
  end if;

  select * into v_item
  from public.garage_items
  where garage_item_id = p_garage_item_id
  for update;

  if not found then
    raise exception 'Garage-objektet finns inte';
  end if;

  if v_item.voided_at is not null then
    return v_item;
  end if;

  if public.is_verified_salu_garage_recipient_v1(v_item.garage_item_id) then
    raise exception 'Verifierad SALU → Garage-mottagare kan inte makuleras genom generell Garage-makulering'
      using errcode = 'P0001';
  end if;

  if v_item.handed_off_nybil_id is not null
     or exists (
       select 1 from public.nybil_inventering n
       where n.source_garage_item_id = p_garage_item_id
     ) then
    raise exception 'Garage-objektet är redan överlämnat till Ny bil och kan inte makuleras';
  end if;

  if exists (
    select 1 from public.garage_wheel_changes w
    where w.garage_item_id = p_garage_item_id
  ) then
    raise exception 'Garage-objektet har hjulskifteshistorik och kan inte makuleras';
  end if;

  update public.garage_items
  set voided_at = clock_timestamp(),
      voided_by = p_actor,
      void_reason = v_reason,
      updated_at = clock_timestamp(),
      updated_by = p_actor
  where garage_item_id = p_garage_item_id
  returning * into v_item;

  return v_item;
end;
$$;

revoke all on function public.void_garage_item(uuid, text, uuid) from public;
revoke all on function public.void_garage_item(uuid, text, uuid) from anon;
revoke all on function public.void_garage_item(uuid, text, uuid) from authenticated;
grant execute on function public.void_garage_item(uuid, text, uuid) to service_role;
