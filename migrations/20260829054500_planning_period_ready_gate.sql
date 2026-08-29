-- Planering: explicit period-level release gate before Garage may materialize BESTÄLLT.

create table if not exists public.planning_period_status (
  period_code text primary key,
  status text not null default 'PAGAENDE' check (status in ('PAGAENDE','KLAR')),
  ready_at timestamptz,
  ready_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.planning_period_status enable row level security;
revoke all on public.planning_period_status from anon, authenticated;

comment on table public.planning_period_status is
  'Explicit monthly Planering release gate. Garage may materialize BESTALLT only when status=KLAR.';
comment on column public.planning_period_status.status is
  'PAGAENDE = editable/not releasable. KLAR = locked for planning writes and releasable to Garage.';
