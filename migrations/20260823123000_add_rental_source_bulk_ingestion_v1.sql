begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Transport adapter only. Every row still passes through the canonical
-- ingest_rental_source_row function, which owns RAW immutability, A-I
-- projection, conflict handling and RENTAL write-through semantics.
create or replace function public.ingest_rental_source_rows(
  p_batch_id uuid,
  p_source_system text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row jsonb;
  v_result jsonb;
  v_seen integer := 0;
  v_accepted integer := 0;
  v_conflicts integer := 0;
  v_conflict_codes jsonb := '{}'::jsonb;
begin
  if p_batch_id is null then
    raise exception 'Rental source batch id is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_source_system, '')), '') is null then
    raise exception 'Rental source system is required' using errcode = '22023';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rental source rows must be a JSON array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_rows) = 0 then
    raise exception 'Rental source rows cannot be empty' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_rows) > 250 then
    raise exception 'Rental source chunk exceeds 250 rows' using errcode = '22023';
  end if;

  for v_row in select value from pg_catalog.jsonb_array_elements(p_rows)
  loop
    if pg_catalog.jsonb_typeof(v_row) <> 'object' then
      raise exception 'Each rental source row must be a JSON object' using errcode = '22023';
    end if;

    v_seen := v_seen + 1;

    v_result := public.ingest_rental_source_row(
      p_batch_id,
      p_source_system,
      v_row->>'agreementNo',
      (v_row->>'sourceRowNumber')::integer,
      v_row->'raw',
      v_row->>'closeMonth',
      v_row->>'stationNo',
      v_row->>'outStation',
      case when v_row->>'closeYear' is null then null else (v_row->>'closeYear')::integer end,
      case when v_row->>'closedDate' is null then null else (v_row->>'closedDate')::date end,
      v_row->>'agreementNo',
      (v_row->>'outAt')::timestamptz,
      case when v_row->>'inAt' is null then null else (v_row->>'inAt')::timestamptz end,
      v_row->>'regnr'
    );

    if coalesce((v_result->>'projectionAccepted')::boolean, true) then
      v_accepted := v_accepted + 1;
    else
      v_conflicts := v_conflicts + 1;
      if v_result->>'conflictCode' is not null then
        v_conflict_codes := pg_catalog.jsonb_set(
          v_conflict_codes,
          array[v_result->>'conflictCode'],
          pg_catalog.to_jsonb(coalesce((v_conflict_codes->>(v_result->>'conflictCode'))::integer, 0) + 1),
          true
        );
      end if;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'seen', v_seen,
    'accepted', v_accepted,
    'conflicts', v_conflicts,
    'conflictCodes', v_conflict_codes
  );
end;
$$;

revoke all on function public.ingest_rental_source_rows(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_rental_source_rows(uuid, text, jsonb)
  to service_role;

commit;
