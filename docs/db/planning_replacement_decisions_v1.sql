begin;

create table if not exists public.planning_replacement_decisions (
  regnr text primary key,
  decision_status text not null
    check (decision_status in ('REPLACE', 'CANCELLED')),
  salu_date_at_decision date not null,
  model_snapshot text,
  station_code_snapshot text,
  decided_at timestamptz not null default now(),
  decided_by uuid not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null
);

comment on table public.planning_replacement_decisions is
  'Explicit user-authored replacement decisions for individual vehicles shown by SALU decision support. This table belongs to Planering, does not mutate SALU, and does not create BEHOV, UTOKNING, MINSKNING or BESTALLT.';

comment on column public.planning_replacement_decisions.regnr is
  'Canonical permanent vehicle identity. One current replacement decision per vehicle.';
comment on column public.planning_replacement_decisions.salu_date_at_decision is
  'Snapshot of current SALU date when the user made the decision. It is context only and does not alter SALU.';
comment on column public.planning_replacement_decisions.decision_status is
  'REPLACE is an active explicit replacement decision. CANCELLED preserves the cancelled decision without deleting audit context.';

create index if not exists planning_replacement_decisions_status_idx
  on public.planning_replacement_decisions (decision_status, salu_date_at_decision);

alter table public.planning_replacement_decisions enable row level security;
revoke all on public.planning_replacement_decisions from anon, authenticated;
grant all on public.planning_replacement_decisions to service_role;

commit;
