begin;

insert into public.mandate_capability_definitions (capability_code, title, description)
values (
  'ACCESS_INSIGHT',
  'Öppna INSIGHT',
  'Ger explicit åtkomst till INSIGHT och dess server-gated analytics consumers.'
)
on conflict (capability_code) do update
set title = excluded.title,
    description = excluded.description,
    active = true,
    changed_at = now();

-- No employee_mandates are seeded. INSIGHT grants are an explicit organisational decision.

commit;
