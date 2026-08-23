begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- One rich agreement/rental source is ingested once. The full source row is
-- preserved in RAW so Layer 1 and the future economic layer can project the
-- same source truth without creating parallel imports.
create table public.rental_source_import_batches (
  batch_id uuid primary key default gen_random_uuid(),
  source_system text not null check (length(trim(source_system)) > 0),
  source_report_name text not null check (length(trim(source_report_name)) > 0),
  source_generated_at timestamptz,
  source_file_name text,
  source_file_hash text,
  row_count integer check (row_count is null or row_count >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create unique index rental_source_import_batches_file_uidx
  on public.rental_source_import_batches (source_system, source_file_hash)
  where source_file_hash is not null;

create table public.rental_source_rows_raw (
  raw_row_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.rental_source_import_batches(batch_id) on delete restrict,
  source_system text not null check (length(trim(source_system)) > 0),
  source_record_id text not null check (length(trim(source_record_id)) > 0),
  source_row_number integer check (source_row_number is null or source_row_number > 0),
  raw_payload jsonb not null check (jsonb_typeof(raw_payload) = 'object'),
  raw_payload_hash text,
  created_at timestamptz not null default now()
);

create unique index rental_source_rows_raw_batch_row_uidx
  on public.rental_source_rows_raw (batch_id, source_row_number)
  where source_row_number is not null;

create index rental_source_rows_raw_source_idx
  on public.rental_source_rows_raw (source_system, source_record_id, created_at desc);

-- Canonical operational projection for Layer 1 only.
-- A-I are preserved as typed fields while the entire source row remains in RAW.
create table public.rental_operational_facts (
  rental_fact_id uuid primary key default gen_random_uuid(),
  source_system text not null check (length(trim(source_system)) > 0),
  source_record_id text not null check (length(trim(source_record_id)) > 0),
  source_raw_row_id uuid not null references public.rental_source_rows_raw(raw_row_id) on delete restrict,

  -- A: Avsl. Månad
  close_month text,
  -- B: Stn. Text is deliberate so leading zeroes are never lost.
  station_no text,
  -- C: Ut Stn / depå. Text is deliberate so leading zeroes are never lost.
  out_station text,
  -- D: Avsl. År
  close_year integer,
  -- E: Avsl. Datum. This is contract close, never RENTAL end.
  closed_date date,
  -- F: AvtalsNr / stable source_record_id
  agreement_no text not null check (length(trim(agreement_no)) > 0),
  -- G: UtDt / RENTAL start fact
  out_at timestamptz not null,
  -- H: InDt / RENTAL end fact when present
  in_at timestamptz,
  -- I: RegNr
  regnr text not null check (length(trim(regnr)) > 0),

  -- Hash only the Layer 1 projection. Economic changes in RAW must not create
  -- an operational state change merely because the source row was updated.
  operational_hash text not null check (length(trim(operational_hash)) > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source_system, source_record_id),
  check (source_record_id = agreement_no),
  check (in_at is null or in_at >= out_at)
);

create index rental_operational_facts_regnr_time_idx
  on public.rental_operational_facts (regnr, out_at desc);

alter table public.rental_source_import_batches enable row level security;
alter table public.rental_source_rows_raw enable row level security;
alter table public.rental_operational_facts enable row level security;

revoke all on public.rental_source_import_batches from public, anon, authenticated;
revoke all on public.rental_source_rows_raw from public, anon, authenticated;
revoke all on public.rental_operational_facts from public, anon, authenticated;

-- Batches and RAW are append-only source evidence. Canonical facts may be
-- updated by a later server-side ingestion path as the same agreement gains H/E.
grant select, insert on public.rental_source_import_batches to service_role;
grant select, insert on public.rental_source_rows_raw to service_role;
grant select, insert, update on public.rental_operational_facts to service_role;

commit;
