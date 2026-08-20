-- Sync Production SALU AUTO rules and function hardening into repository history.
-- Idempotent with Production migration 20260820083310.

begin;

insert into public.salu_auto_rules (
  rule_id,
  rule_version,
  make,
  model_tokens,
  months,
  priority,
  active,
  valid_from
) values
  ('77273c9d-c26e-47e3-96d8-6a350e2f49f6', 1, 'Renault', '{}', 12, 0, true, '2026-08-20'),
  ('9ee8577a-63ac-41c7-9aa6-4c3449ebcf99', 1, 'MG', '{}', 12, 0, true, '2026-08-20'),
  ('1cc999e2-a51b-4130-8384-6f9e52c28f5d', 1, 'Nissan', '{}', 12, 0, true, '2026-08-20'),
  ('1fbd3e31-5f23-41ac-9b8e-b805a3f901db', 1, 'Opel', '{}', 12, 0, true, '2026-08-20'),
  ('5397e677-61ed-4e72-a607-9603b9cabd55', 1, 'Seat', '{}', 12, 0, true, '2026-08-20'),
  ('4d08cd3c-6109-42ac-8aa8-04e2e894e824', 1, 'Subaru', '{}', 12, 0, true, '2026-08-20')
on conflict (rule_id, rule_version) do update set
  make = excluded.make,
  model_tokens = excluded.model_tokens,
  months = excluded.months,
  priority = excluded.priority,
  active = excluded.active,
  valid_from = excluded.valid_from;

alter function public.reject_salu_event_mutation()
  security invoker;
alter function public.reject_salu_event_mutation()
  set search_path = '';
revoke all on function public.reject_salu_event_mutation() from public, anon, authenticated;
grant execute on function public.reject_salu_event_mutation() to service_role;

alter function public.apply_salu_vehicle_plan(text, date, date, text, integer, uuid, integer, integer, uuid)
  security invoker;
alter function public.apply_salu_vehicle_plan(text, date, date, text, integer, uuid, integer, integer, uuid)
  set search_path = '';
revoke all on function public.apply_salu_vehicle_plan(text, date, date, text, integer, uuid, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_salu_vehicle_plan(text, date, date, text, integer, uuid, integer, integer, uuid)
  to service_role;

commit;
