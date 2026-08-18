-- Step 3.2B-1: make public.damages the only live BUHS source.
--
-- This preserves the existing browser RPC name, argument, return composite
-- type, column order, SECURITY INVOKER mode, and execute grants.
-- public.damages_external remains untouched as a rollback snapshot.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Abort instead of switching source if the rollback snapshot has drifted from
-- the canonical BUHS projection at migration time.
do $$
begin
  if exists (
    select 1
    from (
      (
        select
          regnr,
          saludatum,
          damage_date,
          damage_type_raw,
          note_customer,
          note_internal,
          vehiclenote
        from public.damages_external

        except all

        select
          regnr,
          saludatum,
          damage_date,
          damage_type_raw,
          note_customer,
          note_internal,
          vehiclenote
        from public.damages
        where source = 'BUHS'
      )

      union all

      (
        select
          regnr,
          saludatum,
          damage_date,
          damage_type_raw,
          note_customer,
          note_internal,
          vehiclenote
        from public.damages
        where source = 'BUHS'

        except all

        select
          regnr,
          saludatum,
          damage_date,
          damage_type_raw,
          note_customer,
          note_internal,
          vehiclenote
        from public.damages_external
      )
    ) as drift
  ) then
    raise exception
      'Step 3.2B-1 aborted: damages_external differs from damages source=BUHS';
  end if;
end
$$;

create or replace function public.get_damages_by_trimmed_regnr(p_regnr text)
returns setof public.damages_external
language sql
security invoker
set search_path = public
as $function$
  select
    d.regnr,
    d.saludatum,
    d.damage_date,
    d.damage_type_raw,
    d.note_customer,
    d.note_internal,
    d.vehiclenote
  from public.damages as d
  where d.source = 'BUHS'
    and trim(upper(d.regnr)) = trim(upper(p_regnr));
$function$;

grant execute
on function public.get_damages_by_trimmed_regnr(text)
to authenticated, service_role;

comment on function public.get_damages_by_trimmed_regnr(text) is
  'Returns the BUHS projection from canonical public.damages; Step 3.2B-1.';

commit;
