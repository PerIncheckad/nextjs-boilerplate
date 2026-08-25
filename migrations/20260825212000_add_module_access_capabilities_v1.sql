begin;

insert into public.business_function_definitions (function_code, title, description)
values
  ('CEO', 'CEO', 'Övergripande verksamhetsledning.'),
  ('COO', 'COO', 'Operativ verksamhetsledning.'),
  ('STATIONSCHEF', 'Stationschef', 'Operativt ansvar för station.'),
  ('BILKONTROLLCHEF', 'Bilkontrollchef', 'Ledningsansvar inom Bilkontroll.')
on conflict (function_code) do nothing;

insert into public.mandate_capability_definitions (capability_code, title, description)
values
  ('ACCESS_PLANERING', 'Öppna Planering', 'Ger åtkomst till Planeringsmodulen och dess API.'),
  ('ACCESS_TOWER', 'Öppna Tower', 'Ger åtkomst till Tower och dess read-model API:er.'),
  ('ACCESS_GARAGE', 'Öppna Garaget', 'Ger åtkomst till Garaget och dess API.')
on conflict (capability_code) do nothing;

-- No employee/module assignments are seeded here.
-- Authentication and module access remain separate decisions.
-- Production grants must be explicit before the module guard is activated.

commit;
