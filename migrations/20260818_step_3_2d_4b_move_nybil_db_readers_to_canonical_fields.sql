do $$
declare
  mismatch_count bigint;
begin
  select count(*)
    into mismatch_count
  from public.nybil_inventering
  where modell is distinct from bilmodell;

  if mismatch_count <> 0 then
    raise exception '3.2D-4B blocked: nybil_inventering modell/bilmodell drift = %', mismatch_count;
  end if;

  select count(*)
    into mismatch_count
  from public.nybil_inventering
  where hjul_forvaring_ort is distinct from hjul_forvaring_station;

  if mismatch_count <> 0 then
    raise exception '3.2D-4B blocked: nybil_inventering hjul_forvaring_ort/hjul_forvaring_station drift = %', mismatch_count;
  end if;

  if to_regclass('public.nybil_inventering_backup_20260425') is not null then
    execute 'select count(*) from public.nybil_inventering_backup_20260425 where modell is distinct from bilmodell'
      into mismatch_count;

    if mismatch_count <> 0 then
      raise exception '3.2D-4B blocked: nybil backup modell/bilmodell drift = %', mismatch_count;
    end if;
  end if;
end
$$;

create or replace function public.car_lookup_any(p_reg text)
returns table(regnr text, model text, wheelstorage text, car_id text)
language plpgsql
security definer
as $function$
declare
  v_norm text := upper(regexp_replace(coalesce(p_reg,''), '[\s\-\._]', '', 'g'));
  r record;
  q text;
  reg_expr   text;
  model_expr text;
  wheel_expr text;
  id_expr    text;
  where_expr text;
  has_id boolean;
begin
  for r in
    select table_name
    from information_schema.columns
    where table_schema='public'
      and column_name in ('regnr','registration','licensePlate','plate','reg','reg_no','RegNr','regnr_norm')
    group by table_name
  loop
    reg_expr := public._coalesce_expr('public', r.table_name, 't',
      array['regnr','registration','licensePlate','plate','reg','reg_no','RegNr','regnr_norm'], 'text');

    model_expr := public._coalesce_expr('public', r.table_name, 't',
      array['model','modell','vehicleModel','vehicle_model','Model','brand_model'], 'text');

    wheel_expr := public._coalesce_expr('public', r.table_name, 't',
      array['hjulförvaring','hjulforvaring','hjulforvaring_plats','wheel_storage','wheels_location',
            'tire_storage','tire_location','storage','storage_place','storage_location','hjulplats','däckhotell','dackhotell'], 'text');

    select exists(
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name=r.table_name
        and column_name='id'
    ) into has_id;

    id_expr := case when has_id then 't.id::text' else 'NULL::text' end;

    where_expr := format(
      'upper(regexp_replace(coalesce(%s, ''''), ''[\s\-\._]'', '''', ''g'')) = %L',
      reg_expr, v_norm
    );

    q := format($f$
      select %s as regnr, %s as model, %s as wheelStorage, %s as car_id
      from %I t
      where %s
      limit 1
    $f$, reg_expr, model_expr, wheel_expr, id_expr, r.table_name, where_expr);

    return query execute q;
    if found then return; end if;
  end loop;
  return;
end
$function$;

create or replace view public.v_nybil_baseline as
select distinct on (regnr)
  regnr,
  bilmarke,
  modell,
  bransletyp,
  hjultyp,
  hjul_ej_monterade,
  hjul_forvaring,
  hjul_forvaring_ort,
  hjul_forvaring_ort as hjul_forvaring_station,
  antal_insynsskydd,
  antal_bocker,
  antal_coc,
  antal_nycklar,
  antal_laddkablar,
  antal_laddkablar_forvaring,
  laddkablar_forvaring_plats,
  antal_lasbultar,
  matarstallning_inkop,
  registreringsdatum,
  created_at
from public.nybil_inventering
order by regnr, created_at desc;

alter view public.v_nybil_baseline set (security_invoker = true);

create or replace view public.v_wheel_storage_precedence as
select
  r.regnr,
  coalesce(v.wheel_storage_location, nb.hjul_forvaring) as wheel_storage_text,
  nb.hjul_forvaring_ort as wheel_storage_ort,
  nb.hjul_forvaring_ort as wheel_storage_station
from (
  select upper(vehicles.regnr) as regnr
  from public.vehicles
  union
  select v_nybil_baseline.regnr
  from public.v_nybil_baseline
) r
left join public.vehicles v on upper(v.regnr) = r.regnr
left join public.v_nybil_baseline nb on nb.regnr = r.regnr;

alter view public.v_wheel_storage_precedence set (security_invoker = true);
