begin;

create table if not exists public.planning_vehicle_models (
  model_code text primary key,
  display_name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

comment on table public.planning_vehicle_models is
  'Shared reference registry for vehicle models used by Planering and Garaget. Reference data only; not Layer 1 journey truth and not Kistan output.';
comment on column public.planning_vehicle_models.model_code is
  'Normalized uppercase model key used to prevent duplicate spelling variants.';

insert into public.planning_vehicle_models (model_code, display_name, sort_order, is_active)
select distinct upper(trim(model)), trim(model), 0, true
from public.fleet_planning_cells
where nullif(trim(model), '') is not null
on conflict (model_code) do nothing;

insert into public.planning_vehicle_models (model_code, display_name, sort_order, is_active)
select distinct upper(trim(model)), trim(model), 0, true
from public.garage_items
where nullif(trim(model), '') is not null
on conflict (model_code) do nothing;

alter table public.planning_vehicle_models enable row level security;
revoke all on public.planning_vehicle_models from anon, authenticated;
grant all on public.planning_vehicle_models to service_role;

commit;
