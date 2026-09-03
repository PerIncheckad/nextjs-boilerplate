begin;

alter table public.employees
  add column if not exists station_scope text not null default 'SINGLE'
  check (station_scope in ('SINGLE', 'ALL'));

comment on column public.employees.station_scope is
  'Operational station authorization scope. SINGLE uses employees.station. ALL permits server-validated selection of an actual main station per operation.';

commit;
