begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- One immutable source row per agreement inside one import batch. Replaying the
-- same batch is allowed, but a changed row inside an already identified batch
-- is rejected instead of silently rewriting source evidence.
create unique index if not exists rental_source_rows_raw_batch_record_uidx
  on public.rental_source_rows_raw (batch_id, source_record_id);

create or replace function public.create_rental_source_import_batch(
  p_source_system text,
  p_source_report_name text,
  p_source_generated_at timestamptz,
  p_source_file_name text,
  p_source_file_hash text,
  p_row_count integer,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_batch_id uuid;
  v_source_system text;
  v_source_report_name text;
  v_source_file_hash text;
begin
  v_source_system := nullif(trim(coalesce(p_source_system, '')), '');
  v_source_report_name := nullif(trim(coalesce(p_source_report_name, '')), '');
  v_source_file_hash := nullif(trim(coalesce(p_source_file_hash, '')), '');

  if v_source_system is null then
    raise exception 'Rental source system is required' using errcode = '22023';
  end if;
  if v_source_report_name is null then
    raise exception 'Rental source report name is required' using errcode = '22023';
  end if;
  if v_source_file_hash is null then
    raise exception 'Rental source file hash is required for idempotent import' using errcode = '22023';
  end if;
  if p_row_count is not null and p_row_count < 0 then
    raise exception 'Rental source row count cannot be negative' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Rental source batch metadata must be an object' using errcode = '22023';
  end if;

  select batch_id
  into v_batch_id
  from public.rental_source_import_batches
  where source_system = v_source_system
    and source_file_hash = v_source_file_hash;

  if found then
    return v_batch_id;
  end if;

  insert into public.rental_source_import_batches (
    source_system,
    source_report_name,
    source_generated_at,
    source_file_name,
    source_file_hash,
    row_count,
    metadata
  ) values (
    v_source_system,
    v_source_report_name,
    p_source_generated_at,
    nullif(trim(coalesce(p_source_file_name, '')), ''),
    v_source_file_hash,
    p_row_count,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source_system, source_file_hash)
  where source_file_hash is not null
  do nothing
  returning batch_id into v_batch_id;

  if v_batch_id is null then
    select batch_id
    into v_batch_id
    from public.rental_source_import_batches
    where source_system = v_source_system
      and source_file_hash = v_source_file_hash;
  end if;

  return v_batch_id;
end;
$$;

create or replace function public.ingest_rental_source_row(
  p_batch_id uuid,
  p_source_system text,
  p_source_record_id text,
  p_source_row_number integer,
  p_raw_payload jsonb,
  p_close_month text,
  p_station_no text,
  p_out_station text,
  p_close_year integer,
  p_closed_date date,
  p_agreement_no text,
  p_out_at timestamptz,
  p_in_at timestamptz,
  p_regnr text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_batch public.rental_source_import_batches%rowtype;
  v_raw public.rental_source_rows_raw%rowtype;
  v_fact public.rental_operational_facts%rowtype;
  v_source_system text;
  v_source_record_id text;
  v_agreement_no text;
  v_regnr text;
  v_raw_hash text;
  v_operational_hash text;
  v_existing_raw_hash text;
begin
  v_source_system := nullif(trim(coalesce(p_source_system, '')), '');
  v_source_record_id := nullif(trim(coalesce(p_source_record_id, '')), '');
  v_agreement_no := nullif(trim(coalesce(p_agreement_no, '')), '');
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\\s+', '', 'g'));

  if p_batch_id is null then
    raise exception 'Rental source batch id is required' using errcode = '22023';
  end if;
  if v_source_system is null or v_source_record_id is null or v_agreement_no is null then
    raise exception 'Rental source identity is incomplete' using errcode = '22023';
  end if;
  if v_source_record_id <> v_agreement_no then
    raise exception 'F / AvtalsNr must equal source_record_id' using errcode = '22023';
  end if;
  if v_regnr = '' then
    raise exception 'I / RegNr is required' using errcode = '22023';
  end if;
  if p_out_at is null then
    raise exception 'G / UtDt with source-known time is required' using errcode = '22023';
  end if;
  if p_in_at is not null and p_in_at < p_out_at then
    raise exception 'H / InDt cannot be before G / UtDt' using errcode = '22007';
  end if;
  if p_source_row_number is not null and p_source_row_number <= 0 then
    raise exception 'Source row number must be positive' using errcode = '22023';
  end if;
  if p_raw_payload is null or pg_catalog.jsonb_typeof(p_raw_payload) <> 'object' then
    raise exception 'Complete RAW source row must be a JSON object' using errcode = '22023';
  end if;

  select *
  into v_batch
  from public.rental_source_import_batches
  where batch_id = p_batch_id;

  if not found then
    raise exception 'Rental source batch not found' using errcode = 'P0002';
  end if;
  if v_batch.source_system <> v_source_system then
    raise exception 'Rental source system does not match import batch' using errcode = '22023';
  end if;

  -- jsonb::text has deterministic key ordering in PostgreSQL. This hash is an
  -- integrity/dedup fingerprint, not a security primitive.
  v_raw_hash := md5(p_raw_payload::text);
  v_operational_hash := md5(
    coalesce(p_close_month, '<NULL>') || E'\\x1f' ||
    coalesce(p_station_no, '<NULL>') || E'\\x1f' ||
    coalesce(p_out_station, '<NULL>') || E'\\x1f' ||
    coalesce(p_close_year::text, '<NULL>') || E'\\x1f' ||
    coalesce(p_closed_date::text, '<NULL>') || E'\\x1f' ||
    v_agreement_no || E'\\x1f' ||
    p_out_at::text || E'\\x1f' ||
    coalesce(p_in_at::text, '<NULL>') || E'\\x1f' ||
    v_regnr
  );

  insert into public.rental_source_rows_raw (
    batch_id,
    source_system,
    source_record_id,
    source_row_number,
    raw_payload,
    raw_payload_hash
  ) values (
    p_batch_id,
    v_source_system,
    v_source_record_id,
    p_source_row_number,
    p_raw_payload,
    v_raw_hash
  )
  on conflict (batch_id, source_record_id) do nothing
  returning * into v_raw;

  if v_raw.raw_row_id is null then
    select *
    into v_raw
    from public.rental_source_rows_raw
    where batch_id = p_batch_id
      and source_record_id = v_source_record_id;

    v_existing_raw_hash := v_raw.raw_payload_hash;
    if v_existing_raw_hash is distinct from v_raw_hash then
      raise exception 'Immutable source row changed inside existing import batch'
        using errcode = '23505';
    end if;
  end if;

  insert into public.rental_operational_facts as fact (
    source_system,
    source_record_id,
    source_raw_row_id,
    close_month,
    station_no,
    out_station,
    close_year,
    closed_date,
    agreement_no,
    out_at,
    in_at,
    regnr,
    operational_hash
  ) values (
    v_source_system,
    v_source_record_id,
    v_raw.raw_row_id,
    nullif(trim(coalesce(p_close_month, '')), ''),
    nullif(trim(coalesce(p_station_no, '')), ''),
    nullif(trim(coalesce(p_out_station, '')), ''),
    p_close_year,
    p_closed_date,
    v_agreement_no,
    p_out_at,
    p_in_at,
    v_regnr,
    v_operational_hash
  )
  on conflict (source_system, source_record_id)
  do update set
    source_raw_row_id = excluded.source_raw_row_id,
    close_month = excluded.close_month,
    station_no = excluded.station_no,
    out_station = excluded.out_station,
    close_year = excluded.close_year,
    closed_date = excluded.closed_date,
    agreement_no = excluded.agreement_no,
    out_at = excluded.out_at,
    in_at = excluded.in_at,
    regnr = excluded.regnr,
    operational_hash = excluded.operational_hash,
    last_seen_at = pg_catalog.now(),
    updated_at = case
      when fact.operational_hash is distinct from excluded.operational_hash then pg_catalog.now()
      else fact.updated_at
    end
  returning * into v_fact;

  return pg_catalog.jsonb_build_object(
    'batch_id', p_batch_id,
    'raw_row_id', v_raw.raw_row_id,
    'rental_fact_id', v_fact.rental_fact_id,
    'source_record_id', v_fact.source_record_id,
    'operational_hash', v_fact.operational_hash,
    'out_at', v_fact.out_at,
    'in_at', v_fact.in_at,
    'closed_date', v_fact.closed_date,
    'regnr', v_fact.regnr
  );
end;
$$;

revoke all on function public.create_rental_source_import_batch(text, text, timestamptz, text, text, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.ingest_rental_source_row(uuid, text, text, integer, jsonb, text, text, text, integer, date, text, timestamptz, timestamptz, text)
  from public, anon, authenticated;

grant execute on function public.create_rental_source_import_batch(text, text, timestamptz, text, text, integer, jsonb)
  to service_role;
grant execute on function public.ingest_rental_source_row(uuid, text, text, integer, jsonb, text, text, text, integer, date, text, timestamptz, timestamptz, text)
  to service_role;

commit;
