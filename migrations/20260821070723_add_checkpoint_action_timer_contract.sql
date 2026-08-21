begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Versioned timer rules keep timing decisions configurable and auditable.
-- The default v1 rule is a technical starting point, not hard-coded workflow logic.
create table public.checkpoint_action_timer_rules (
  rule_code text not null,
  rule_version integer not null check (rule_version > 0),
  title text not null check (length(trim(title)) > 0),
  due_soon_hours integer not null check (due_soon_hours >= 0),
  escalation_after_hours integer not null check (escalation_after_hours >= 0),
  reminder_interval_hours integer not null check (reminder_interval_hours > 0),
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  primary key (rule_code, rule_version),
  check (rule_code ~ '^[A-Z0-9][A-Z0-9_-]{1,79}$')
);

create unique index checkpoint_action_timer_rules_one_active_uidx
  on public.checkpoint_action_timer_rules (rule_code)
  where active;

insert into public.checkpoint_action_timer_rules (
  rule_code,
  rule_version,
  title,
  due_soon_hours,
  escalation_after_hours,
  reminder_interval_hours,
  active
) values (
  'DEFAULT',
  1,
  'Standardregel för checkpoint-åtgärder',
  24,
  24,
  24,
  true
)
on conflict (rule_code, rule_version) do nothing;

alter table public.checkpoint_actions
  add column timer_rule_code text,
  add column timer_rule_version integer,
  add column timer_status text not null default 'NORMAL',
  add column reminder_count integer not null default 0,
  add column last_reminder_at timestamptz,
  add column overdue_at timestamptz,
  add column escalated_at timestamptz,
  add column timer_closed_at timestamptz,
  add column next_timer_at timestamptz;

update public.checkpoint_actions action
set timer_rule_code = rule.rule_code,
    timer_rule_version = rule.rule_version,
    timer_status = case
      when action.status in ('VERIFIED', 'CANCELLED') then 'CLOSED'
      else 'NORMAL'
    end,
    timer_closed_at = case
      when action.status in ('VERIFIED', 'CANCELLED') then coalesce(action.verified_at, action.cancelled_at, action.updated_at)
      else null
    end,
    next_timer_at = case
      when action.status in ('VERIFIED', 'CANCELLED') then null
      else action.deadline_at - pg_catalog.make_interval(hours => rule.due_soon_hours)
    end
from public.checkpoint_action_timer_rules rule
where rule.rule_code = 'DEFAULT'
  and rule.active
  and action.timer_rule_code is null;

alter table public.checkpoint_actions
  alter column timer_rule_code set not null,
  alter column timer_rule_version set not null,
  add constraint checkpoint_actions_timer_rule_fkey
    foreign key (timer_rule_code, timer_rule_version)
    references public.checkpoint_action_timer_rules(rule_code, rule_version)
    on delete restrict,
  add constraint checkpoint_actions_timer_status_check
    check (timer_status in ('NORMAL', 'DUE_SOON', 'OVERDUE', 'ESCALATED', 'CLOSED')),
  add constraint checkpoint_actions_reminder_count_check
    check (reminder_count >= 0),
  add constraint checkpoint_actions_timer_projection_check
    check (
      (
        status in ('VERIFIED', 'CANCELLED')
        and timer_status = 'CLOSED'
        and next_timer_at is null
        and timer_closed_at is not null
      )
      or
      (
        status not in ('VERIFIED', 'CANCELLED')
        and timer_status <> 'CLOSED'
        and next_timer_at is not null
        and timer_closed_at is null
      )
    );

create index checkpoint_actions_timer_queue_idx
  on public.checkpoint_actions (next_timer_at, timer_status, action_id)
  where status not in ('VERIFIED', 'CANCELLED');

create index checkpoint_actions_timer_rule_idx
  on public.checkpoint_actions (timer_rule_code, timer_rule_version);

alter table public.checkpoint_action_events
  add column event_key text;

create unique index checkpoint_action_events_event_key_uidx
  on public.checkpoint_action_events (event_key)
  where event_key is not null;

alter table public.checkpoint_action_events
  drop constraint checkpoint_action_events_event_type_check,
  add constraint checkpoint_action_events_event_type_check
    check (event_type in (
      'ACTION_CREATED',
      'ACTION_STATUS_CHANGED',
      'ACTION_VERIFIED',
      'ACTION_CANCELLED',
      'ACTION_DUE_SOON',
      'ACTION_OVERDUE',
      'ACTION_ESCALATED',
      'ACTION_REMINDER_DUE'
    ));

create or replace function public.prepare_checkpoint_action_timer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_rule public.checkpoint_action_timer_rules%rowtype;
begin
  if new.timer_rule_code is null or new.timer_rule_version is null then
    select * into v_rule
    from public.checkpoint_action_timer_rules
    where rule_code = 'DEFAULT'
      and active
      and valid_from <= pg_catalog.now()
    order by rule_version desc
    limit 1;
  else
    select * into v_rule
    from public.checkpoint_action_timer_rules
    where rule_code = new.timer_rule_code
      and rule_version = new.timer_rule_version;
  end if;

  if not found then
    raise exception 'Active checkpoint action timer rule not found' using errcode = 'P0002';
  end if;

  new.timer_rule_code := v_rule.rule_code;
  new.timer_rule_version := v_rule.rule_version;
  new.timer_status := 'NORMAL';
  new.reminder_count := 0;
  new.last_reminder_at := null;
  new.overdue_at := null;
  new.escalated_at := null;
  new.timer_closed_at := null;
  new.next_timer_at := new.deadline_at - pg_catalog.make_interval(hours => v_rule.due_soon_hours);

  return new;
end;
$$;

create trigger checkpoint_actions_prepare_timer_insert
before insert on public.checkpoint_actions
for each row execute function public.prepare_checkpoint_action_timer();

create or replace function public.prevent_checkpoint_action_timer_rule_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.timer_rule_code is distinct from old.timer_rule_code
     or new.timer_rule_version is distinct from old.timer_rule_version then
    raise exception 'Checkpoint action timer rule is immutable; create a new action instead';
  end if;
  return new;
end;
$$;

create trigger checkpoint_actions_timer_rule_immutable
before update of timer_rule_code, timer_rule_version on public.checkpoint_actions
for each row execute function public.prevent_checkpoint_action_timer_rule_change();

create or replace function public.close_checkpoint_action_timer_on_terminal()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if old.status in ('VERIFIED', 'CANCELLED')
     and new.status not in ('VERIFIED', 'CANCELLED') then
    raise exception 'Terminal checkpoint action cannot be reopened';
  end if;

  if new.status in ('VERIFIED', 'CANCELLED')
     and old.status not in ('VERIFIED', 'CANCELLED') then
    new.timer_status := 'CLOSED';
    new.timer_closed_at := pg_catalog.now();
    new.next_timer_at := null;
  end if;

  return new;
end;
$$;

create trigger checkpoint_actions_close_timer_terminal
before update of status on public.checkpoint_actions
for each row execute function public.close_checkpoint_action_timer_on_terminal();

alter table public.checkpoint_action_timer_rules enable row level security;

revoke all on public.checkpoint_action_timer_rules from public, anon, authenticated;
revoke all on function public.prepare_checkpoint_action_timer() from public, anon, authenticated;
revoke all on function public.prevent_checkpoint_action_timer_rule_change() from public, anon, authenticated;
revoke all on function public.close_checkpoint_action_timer_on_terminal() from public, anon, authenticated;

grant select, insert, update, delete on public.checkpoint_action_timer_rules to service_role;
grant execute on function public.prepare_checkpoint_action_timer() to service_role;
grant execute on function public.prevent_checkpoint_action_timer_rule_change() to service_role;
grant execute on function public.close_checkpoint_action_timer_on_terminal() to service_role;

commit;
