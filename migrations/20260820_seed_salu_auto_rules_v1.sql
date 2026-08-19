-- 4.1B SALU AUTO rule baseline v1.
-- Versioned configuration only; no vehicle rows are recalculated or backfilled.

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
  ('10000000-0000-4000-8000-000000000001', 1, 'Mercedes-Benz', '{}', 6, 0, true, '2026-08-20'),
  ('10000000-0000-4000-8000-000000000002', 1, 'Mercedes-Benz', '{Sprinter}', 24, 10, true, '2026-08-20'),
  ('10000000-0000-4000-8000-000000000003', 1, 'Mercedes-Benz', '{Citan}', 24, 10, true, '2026-08-20'),
  ('10000000-0000-4000-8000-000000000004', 1, 'Mercedes-Benz', '{Vito}', 24, 10, true, '2026-08-20'),
  ('10000000-0000-4000-8000-000000000005', 1, 'Mercedes-Benz', '{V}', 24, 10, true, '2026-08-20'),
  ('20000000-0000-4000-8000-000000000001', 1, 'BMW', '{}', 6, 0, true, '2026-08-20'),
  ('30000000-0000-4000-8000-000000000001', 1, 'VW', '{}', 12, 0, true, '2026-08-20'),
  ('40000000-0000-4000-8000-000000000001', 1, 'KIA', '{}', 12, 0, true, '2026-08-20'),
  ('50000000-0000-4000-8000-000000000001', 1, 'FORD', '{}', 12, 0, true, '2026-08-20'),
  ('50000000-0000-4000-8000-000000000002', 1, 'FORD', '{Transit}', 24, 10, true, '2026-08-20'),
  ('50000000-0000-4000-8000-000000000003', 1, 'FORD', '{Connect}', 24, 10, true, '2026-08-20'),
  ('50000000-0000-4000-8000-000000000004', 1, 'FORD', '{Tourneo}', 24, 10, true, '2026-08-20')
on conflict (rule_id, rule_version) do nothing;

commit;
