begin;

insert into public.mandate_capability_definitions (capability_code, title, description)
values (
  'ACCESS_INSIGHT',
  'Öppna Insight',
  'Ger explicit åtkomst till INSIGHT och dess server-side analytics consumer.'
)
on conflict (capability_code) do update
set title = excluded.title,
    description = excluded.description,
    active = true,
    changed_at = now();

-- No employee_mandates are seeded. Organisational assignment is a separate MASTER decision.

commit;
