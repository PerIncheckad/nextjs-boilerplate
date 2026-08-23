begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Canonical Layer 1 facts must never drift away from immutable journey history.
-- RAW still preserves every delivered source row, including later source rows
-- that conflict with an already established G/H/I fact.
create table public.rental_operational_projection_failures (
  failure_id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_record_id text not null,
  source_raw_row_id uuid not null references public.rental_source_rows_raw(raw_row_id) on delete restrict,
  rental_fact_id uuid not null references public.rental_operational_facts(rental_fact_id) on delete restrict,
  conflict_code text not null check (conflict_code in ('IDENTITY_CHANGED','REGNR_CHANGED','OUT_AT_CHANGED','IN_AT_REMOVED','IN_AT_CHANGED')),
  existing_operational jsonb not null check (jsonb_typeof(existing_operational) = 'object'),
  incoming_operational jsonb not null check (jsonb_typeof(incoming_operational) = 'object'),
  attempts integer not null default 1 check (attempts > 0),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  unique (source_raw_row_id, conflict_code)
);

-- The unique index above covers source_raw_row_id. This index covers the second FK.
create index rental_operational_projection_failures_fact_idx
  on public.rental_operational_projection_failures(rental_fact_id);

alter table public.rental_operational_projection_failures enable row level security;
revoke all on public.rental_operational_projection_failures from public, anon, authenticated;
grant select, insert, update on public.rental_operational_projection_failures to service_role;

create or replace function public.guard_rental_operational_fact_immutability()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.source_system is distinct from old.source_system
    or new.source_record_id is distinct from old.source_record_id
    or new.agreement_no is distinct from old.agreement_no then
    raise exception 'RENTAL canonical source identity is immutable' using errcode = 'P0001';
  end if;

  if new.regnr is distinct from old.regnr then
    raise exception 'RENTAL canonical I / RegNr is immutable once established' using errcode = 'P0001';
  end if;

  if new.out_at is distinct from old.out_at then
    raise exception 'RENTAL canonical G / UtDt is immutable once established' using errcode = 'P0001';
  end if;

  if old.in_at is not null and new.in_at is distinct from old.in_at then
    raise exception 'RENTAL canonical H / InDt is immutable once established' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists rental_operational_fact_immutability_guard on public.rental_operational_facts;
create trigger rental_operational_fact_immutability_guard
before update on public.rental_operational_facts
for each row execute function public.guard_rental_operational_fact_immutability();

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
  v_existing_fact public.rental_operational_facts%rowtype;
  v_source_system text;
  v_source_record_id text;
  v_agreement_no text;
  v_regnr text;
  v_raw_hash text;
  v_operational_hash text;
  v_existing_raw_hash text;
  v_conflict_code text;
  v_existing_operational jsonb;
  v_incoming_operational jsonb;
begin
  v_source_system := nullif(trim(coalesce(p_source_system, '')), '');
  v_source_record_id := nullif(trim(coalesce(p_source_record_id, '')), '');
  v_agreement_no := nullif(trim(coalesce(p_agreement_no, '')), '');
  v_regnr := upper(regexp_replace(coalesce(p_regnr, ''), '\s+', '', 'g'));

  if p_batch_id is null then raise exception 'Rental source batch id is required' using errcode = '22023'; end if;
  if v_source_system is null or v_source_record_id is null or v_agreement_no is null then raise exception 'Rental source identity is incomplete' using errcode = '22023'; end if;
  if v_source_record_id <> v_agreement_no then raise exception 'F / AvtalsNr must equal source_record_id' using errcode = '22023'; end if;
  if v_regnr = '' then raise exception 'I / RegNr is required' using errcode = '22023'; end if;
  if p_out_at is null then raise exception 'G / UtDt with source-known time is required' using errcode = '22023'; end if;
  if p_in_at is not null and p_in_at < p_out_at then raise exception 'H / InDt cannot be before G / UtDt' using errcode = '22007'; end if;
  if p_source_row_number is not null and p_source_row_number <= 0 then raise exception 'Source row number must be positive' using errcode = '22023'; end if;
  if p_raw_payload is null or pg_catalog.jsonb_typeof(p_raw_payload) <> 'object' then raise exception 'Complete RAW source row must be a JSON object' using errcode = '22023'; end if;

  select * into v_batch from public.rental_source_import_batches where batch_id = p_batch_id;
  if not found then raise exception 'Rental source batch not found' using errcode = 'P0002'; end if;
  if v_batch.source_system <> v_source_system then raise exception 'Rental source system does not match import batch' using errcode = '22023'; end if;

  v_raw_hash := md5(p_raw_payload::text);
  v_operational_hash := md5(
    coalesce(p_close_month, '<NULL>') || E'\x1f' ||
    coalesce(p_station_no, '<NULL>') || E'\x1f' ||
    coalesce(p_out_station, '<NULL>') || E'\x1f' ||
    coalesce(p_close_year::text, '<NULL>') || E'\x1f' ||
    coalesce(p_closed_date::text, '<NULL>') || E'\x1f' ||
    v_agreement_no || E'\x1f' || p_out_at::text || E'\x1f' ||
    coalesce(p_in_at::text, '<NULL>') || E'\x1f' || v_regnr
  );

  insert into public.rental_source_rows_raw (
    batch_id, source_system, source_record_id, source_row_number, raw_payload, raw_payload_hash
  ) values (
    p_batch_id, v_source_system, v_source_record_id, p_source_row_number, p_raw_payload, v_raw_hash
  )
  on conflict (batch_id, source_record_id) do nothing
  returning * into v_raw;

  if v_raw.raw_row_id is null then
    select * into v_raw
    from public.rental_source_rows_raw
    where batch_id = p_batch_id and source_record_id = v_source_record_id;
    v_existing_raw_hash := v_raw.raw_payload_hash;
    if v_existing_raw_hash is distinct from v_raw_hash then
      raise exception 'Immutable source row changed inside existing import batch' using errcode = '23505';
    end if;
  end if;

  select * into v_existing_fact
  from public.rental_operational_facts
  where source_system = v_source_system and source_record_id = v_source_record_id
  for update;

  if found then
    if v_existing_fact.agreement_no is distinct from v_agreement_no then
      v_conflict_code := 'IDENTITY_CHANGED';
    elsif v_existing_fact.regnr is distinct from v_regnr then
      v_conflict_code := 'REGNR_CHANGED';
    elsif v_existing_fact.out_at is distinct from p_out_at then
      v_conflict_code := 'OUT_AT_CHANGED';
    elsif v_existing_fact.in_at is not null and p_in_at is null then
      v_conflict_code := 'IN_AT_REMOVED';
    elsif v_existing_fact.in_at is not null and v_existing_fact.in_at is distinct from p_in_at then
      v_conflict_code := 'IN_AT_CHANGED';
    end if;
  end if;

  if v_conflict_code is not null then
    v_existing_operational := pg_catalog.jsonb_build_object(
      'agreementNo', v_existing_fact.agreement_no,
      'regnr', v_existing_fact.regnr,
      'outAt', v_existing_fact.out_at,
      'inAt', v_existing_fact.in_at
    );
    v_incoming_operational := pg_catalog.jsonb_build_object(
      'agreementNo', v_agreement_no,
      'regnr', v_regnr,
      'outAt', p_out_at,
      'inAt', p_in_at
    );

    insert into public.rental_operational_projection_failures as failure (
      source_system, source_record_id, source_raw_row_id, rental_fact_id,
      conflict_code, existing_operational, incoming_operational
    ) values (
      v_source_system, v_source_record_id, v_raw.raw_row_id, v_existing_fact.rental_fact_id,
      v_conflict_code, v_existing_operational, v_incoming_operational
    )
    on conflict (source_raw_row_id, conflict_code) do update set
      attempts = failure.attempts + 1,
      last_failed_at = pg_catalog.now(),
      existing_operational = excluded.existing_operational,
      incoming_operational = excluded.incoming_operational;

    return pg_catalog.jsonb_build_object(
      'batch_id', p_batch_id,
      'raw_row_id', v_raw.raw_row_id,
      'rental_fact_id', v_existing_fact.rental_fact_id,
      'source_record_id', v_source_record_id,
      'projectionAccepted', false,
      'conflictCode', v_conflict_code,
      'canonicalOutAt', v_existing_fact.out_at,
      'canonicalInAt', v_existing_fact.in_at,
      'canonicalRegnr', v_existing_fact.regnr
    );
  end if;

  insert into public.rental_operational_facts as fact (
    source_system, source_record_id, source_raw_row_id, close_month, station_no,
    out_station, close_year, closed_date, agreement_no, out_at, in_at, regnr, operational_hash
  ) values (
    v_source_system, v_source_record_id, v_raw.raw_row_id,
    nullif(trim(coalesce(p_close_month, '')), ''),
    nullif(trim(coalesce(p_station_no, '')), ''),
    nullif(trim(coalesce(p_out_station, '')), ''),
    p_close_year, p_closed_date, v_agreement_no, p_out_at, p_in_at, v_regnr, v_operational_hash
  )
  on conflict (source_system, source_record_id) do update set
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
    updated_at = case when fact.operational_hash is distinct from excluded.operational_hash then pg_catalog.now() else fact.updated_at end
  returning * into v_fact;

  return pg_catalog.jsonb_build_object(
    'batch_id', p_batch_id,
    'raw_row_id', v_raw.raw_row_id,
    'rental_fact_id', v_fact.rental_fact_id,
    'source_record_id', v_fact.source_record_id,
    'projectionAccepted', true,
    'operational_hash', v_fact.operational_hash,
    'out_at', v_fact.out_at,
    'in_at', v_fact.in_at,
    'closed_date', v_fact.closed_date,
    'regnr', v_fact.regnr
  );
end;
$$;

revoke all on function public.guard_rental_operational_fact_immutability() from public, anon, authenticated;
revoke all on function public.ingest_rental_source_row(uuid, text, text, integer, jsonb, text, text, text, integer, date, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.ingest_rental_source_row(uuid, text, text, integer, jsonb, text, text, text, integer, date, text, timestamptz, timestamptz, text) to service_role;

commit;
