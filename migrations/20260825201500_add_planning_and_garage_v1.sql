begin;

create table if not exists public.fleet_planning_cells (
  planning_cell_id uuid primary key default gen_random_uuid(),
  period_code text not null,
  model text not null,
  station text not null check (station in ('166', '170', '274')),
  salu_count integer not null default 0 check (salu_count >= 0),
  behov_count integer not null default 0 check (behov_count >= 0),
  utok_count integer not null default 0 check (utok_count >= 0),
  minskning_count integer not null default 0 check (minskning_count >= 0),
  ordered_count integer not null default 0 check (ordered_count >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint fleet_planning_cells_period_model_station_key unique (period_code, model, station)
);

comment on table public.fleet_planning_cells is
  'Planning-domain matrix cells. Future intent only; not vehicle journey truth and not monetary outcome.';
comment on column public.fleet_planning_cells.period_code is
  'User-controlled planning period, for example 2026-Q3 or 2026-09-30.';
comment on column public.fleet_planning_cells.station is
  'Planning station. v1 is explicitly limited to 166, 170 and 274.';

create index if not exists fleet_planning_cells_period_idx
  on public.fleet_planning_cells (period_code, model, station);

create table if not exists public.garage_items (
  garage_item_id uuid primary key default gen_random_uuid(),
  planning_period text,
  model text not null,
  planning_reason text not null default 'BEHOV'
    check (planning_reason in ('BEHOV', 'UTOK', 'MINSKNING', 'SALU_RETUR', 'ANNAT')),
  supplier text,
  order_reference text,
  regnr text,
  vin text,
  source_regnr text,
  planned_station text check (planned_station is null or planned_station in ('166', '170', '274')),
  saluort text,
  daily_rate numeric(12,2) check (daily_rate is null or daily_rate >= 0),
  ordered_at date,
  calloff_at date,
  confirmation_status text not null default 'PLANERAD'
    check (confirmation_status in ('PLANERAD', 'BESTALLD', 'AVROPAD', 'AVVAKTAR_BEKRAFTELSE', 'BEKRAFTAD')),
  transport_status text not null default 'EJ_BOKAD'
    check (transport_status in ('EJ_BOKAD', 'TRANSPORTBOKAD', 'PA_VAG', 'ANKOMMEN')),
  planned_delivery_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

comment on table public.garage_items is
  'BK Garage planning objects. Exists outside Layer 1 and Layer 2. May exist before regnr/VIN and may also reference an existing vehicle returning from SALU.';
comment on column public.garage_items.source_regnr is
  'Optional existing vehicle identity when a known vehicle returns to Garage for a new disposition. Does not rewrite Layer 1 history.';
comment on column public.garage_items.daily_rate is
  'Planned daily rate only. Not verified monetary consequence and not Kistan output.';

create index if not exists garage_items_period_station_idx
  on public.garage_items (planning_period, planned_station, model);
create index if not exists garage_items_regnr_idx
  on public.garage_items (upper(regnr)) where regnr is not null;
create index if not exists garage_items_vin_idx
  on public.garage_items (upper(vin)) where vin is not null;

create table if not exists public.garage_station_events (
  garage_station_event_id uuid primary key default gen_random_uuid(),
  garage_item_id uuid not null references public.garage_items(garage_item_id) on delete cascade,
  from_station text check (from_station is null or from_station in ('166', '170', '274')),
  to_station text check (to_station is null or to_station in ('166', '170', '274')),
  reason text,
  changed_at timestamptz not null default now(),
  changed_by uuid
);

comment on table public.garage_station_events is
  'Append-only audit of Garage station replanning.';

alter table public.fleet_planning_cells enable row level security;
alter table public.garage_items enable row level security;
alter table public.garage_station_events enable row level security;

revoke all on public.fleet_planning_cells from anon, authenticated;
revoke all on public.garage_items from anon, authenticated;
revoke all on public.garage_station_events from anon, authenticated;

grant all on public.fleet_planning_cells to service_role;
grant all on public.garage_items to service_role;
grant all on public.garage_station_events to service_role;

commit;
