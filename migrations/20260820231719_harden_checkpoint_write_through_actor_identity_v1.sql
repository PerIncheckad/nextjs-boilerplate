begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Source display names stay in source_context. Actor email comes from verified
-- JWT claims (or the canonical Check-in email) and is never populated with a name.
create or replace function public.write_through_nybil_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.try_record_verified_source_checkpoint(
    new.regnr,
    'NYBIL_BASELINE_CAPTURED',
    'nybil:' || new.id::text,
    coalesce(new.created_at, new.updated_at, pg_catalog.now()),
    'nybil_inventering',
    new.id::text,
    null,
    pg_catalog.jsonb_build_object(
      'sourceKind', 'NYBIL_BASELINE',
      'sourceStatus', 'RECORDED',
      'registeredBy', new.registrerad_av,
      'fullName', new.fullstandigt_namn
    ),
    auth.uid(),
    nullif(auth.jwt() ->> 'email', '')
  );

  return new;
end;
$$;

create or replace function public.write_through_checkin_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status <> 'COMPLETED' or new.completed_at is null then
    return new;
  end if;

  perform public.try_record_verified_source_checkpoint(
    new.regnr,
    'CHECKIN_COMPLETED',
    'checkin:' || new.id::text,
    new.completed_at,
    'checkins',
    new.id::text,
    null,
    pg_catalog.jsonb_build_object(
      'sourceKind', 'CHECKIN',
      'sourceStatus', 'COMPLETED',
      'completedBy', new.completed_by,
      'checkerName', new.checker_name,
      'checkerEmail', new.checker_email
    ),
    coalesce(new.completed_by, auth.uid()),
    coalesce(nullif(trim(new.checker_email), ''), nullif(auth.jwt() ->> 'email', ''))
  );

  return new;
end;
$$;

create or replace function public.write_through_salu_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.try_record_verified_source_checkpoint(
    new.regnr,
    'SALU_CYCLE_CREATED',
    'salu:' || new.flag_id::text,
    coalesce(new.created_at, pg_catalog.now()),
    'salu_flags',
    new.flag_id::text,
    null,
    pg_catalog.jsonb_build_object(
      'sourceKind', 'SALU_CYCLE',
      'sourceStatus', new.status,
      'cycleSaludatum', new.cycle_saludatum,
      'currentSaludatum', new.current_saludatum,
      'ownerFunction', new.owner_function
    ),
    coalesce(new.created_by, auth.uid()),
    nullif(auth.jwt() ->> 'email', '')
  );

  return new;
end;
$$;

revoke all on function public.write_through_nybil_checkpoint()
  from public, anon, authenticated;
revoke all on function public.write_through_checkin_checkpoint()
  from public, anon, authenticated;
revoke all on function public.write_through_salu_checkpoint()
  from public, anon, authenticated;

grant execute on function public.write_through_nybil_checkpoint()
  to service_role;
grant execute on function public.write_through_checkin_checkpoint()
  to service_role;
grant execute on function public.write_through_salu_checkpoint()
  to service_role;

commit;
