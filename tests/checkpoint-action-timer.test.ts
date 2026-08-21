import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const contract = read('migrations/20260821070723_add_checkpoint_action_timer_contract.sql');
const runner = read('migrations/20260821070855_add_checkpoint_action_timer_runner.sql');
const scheduler = read('app/api/checkpoint-actions/scheduler/route.ts');
const readModel = read('app/api/checkpoint-actions/read-model/route.ts');
const panel = read('app/vagnkort/checkpoint-actions-panel.tsx');
const vercel = read('vercel.json');

test('checkpoint action timers use versioned configurable rules and an immutable action snapshot', () => {
  assert.match(contract, /create table public\.checkpoint_action_timer_rules/i);
  assert.match(contract, /primary key \(rule_code, rule_version\)/i);
  assert.match(contract, /due_soon_hours/i);
  assert.match(contract, /escalation_after_hours/i);
  assert.match(contract, /reminder_interval_hours/i);
  assert.match(contract, /'DEFAULT'[\s\S]*24[\s\S]*24[\s\S]*24/i);
  assert.match(contract, /timer_rule_code/i);
  assert.match(contract, /timer_rule_version/i);
  assert.match(contract, /function public\.prevent_checkpoint_action_timer_rule_change/i);
  assert.match(contract, /Checkpoint action timer rule is immutable/i);
});

test('timer projection is closed by terminal workflow status without changing workflow semantics', () => {
  assert.match(contract, /timer_status in \('NORMAL', 'DUE_SOON', 'OVERDUE', 'ESCALATED', 'CLOSED'\)/i);
  assert.match(contract, /function public\.close_checkpoint_action_timer_on_terminal/i);
  assert.match(contract, /new\.timer_status := 'CLOSED'/i);
  assert.match(contract, /new\.next_timer_at := null/i);
  assert.match(runner, /where action\.status not in \('VERIFIED', 'CANCELLED'\)/i);
  assert.doesNotMatch(runner, /set\s+status\s*=/i);
});

test('timer runner is idempotent, concurrency-safe and appends auditable action and journey events', () => {
  assert.match(runner, /function public\.run_checkpoint_action_timers/i);
  assert.match(runner, /for update of action skip locked/i);
  assert.match(runner, /function public\.append_checkpoint_action_timer_event/i);
  assert.match(runner, /on conflict do nothing/i);
  assert.match(contract, /checkpoint_action_events_event_key_uidx/i);

  for (const eventType of [
    'ACTION_DUE_SOON',
    'ACTION_OVERDUE',
    'ACTION_ESCALATED',
    'ACTION_REMINDER_DUE',
  ]) {
    assert.match(runner, new RegExp(`'${eventType}'`));
  }

  for (const eventType of [
    'CHECKPOINT_ACTION_DUE_SOON',
    'CHECKPOINT_ACTION_OVERDUE',
    'CHECKPOINT_ACTION_ESCALATED',
    'CHECKPOINT_ACTION_REMINDER_DUE',
  ]) {
    assert.match(runner, new RegExp(`'${eventType}'`));
  }

  assert.match(runner, /p_apply boolean default false/i);
  assert.match(runner, /if p_apply then/i);
});

test('timer tables and RPCs remain server-only', () => {
  assert.match(contract, /enable row level security/i);
  assert.match(contract, /revoke all on public\.checkpoint_action_timer_rules from public, anon, authenticated/i);
  assert.match(contract, /to service_role/i);
  assert.match(runner, /revoke all on function public\.run_checkpoint_action_timers[\s\S]*from public, anon, authenticated/i);
  assert.match(runner, /grant execute on function public\.run_checkpoint_action_timers[\s\S]*to service_role/i);
});

test('scheduler is token-protected, supports dry run and delegates to one timer RPC', () => {
  assert.match(scheduler, /CHECKPOINT_ACTION_SCHEDULER_TOKEN/);
  assert.match(scheduler, /CRON_SECRET/);
  assert.match(scheduler, /dryRun/);
  assert.match(scheduler, /rpc\('run_checkpoint_action_timers'/);
  assert.match(scheduler, /p_apply:\s*!dryRun/);
  assert.doesNotMatch(scheduler, /verifyApiUser/);
  assert.match(vercel, /"path": "\/api\/checkpoint-actions\/scheduler"/);
  assert.match(vercel, /"schedule": "15 \* \* \* \*"/);
});

test('checkpoint action scheduler stays behind the token boundary', async () => {
  const originalToken = process.env.CHECKPOINT_ACTION_SCHEDULER_TOKEN;
  const originalCronSecret = process.env.CRON_SECRET;

  delete process.env.CHECKPOINT_ACTION_SCHEDULER_TOKEN;
  delete process.env.CRON_SECRET;

  try {
    const unauthenticated = await proxy(new NextRequest(
      'http://localhost/api/checkpoint-actions/scheduler',
    ));
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(await unauthenticated.json(), { error: 'Authentication required' });

    process.env.CHECKPOINT_ACTION_SCHEDULER_TOKEN = 'checkpoint-timer-secret';
    const authorized = await proxy(new NextRequest(
      'http://localhost/api/checkpoint-actions/scheduler',
      { headers: { authorization: 'Bearer checkpoint-timer-secret' } },
    ));
    assert.equal(authorized.status, 200);
  } finally {
    if (originalToken === undefined) delete process.env.CHECKPOINT_ACTION_SCHEDULER_TOKEN;
    else process.env.CHECKPOINT_ACTION_SCHEDULER_TOKEN = originalToken;

    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  }
});

test('Vagnkort read model and UI surface due soon, overdue, reminders and escalation', () => {
  for (const field of [
    'timer_status',
    'reminder_count',
    'last_reminder_at',
    'overdue_at',
    'escalated_at',
    'next_timer_at',
  ]) {
    assert.match(readModel, new RegExp(field));
  }

  assert.match(readModel, /dueSoon/);
  assert.match(readModel, /escalated/);
  assert.match(readModel, /reminders/);
  assert.match(panel, /Åtgärder, timer och ny verifiering/);
  assert.match(panel, /Förfaller snart/);
  assert.match(panel, /Försenad/);
  assert.match(panel, /Eskalerad/);
  assert.match(panel, /Påminnelser:/);
  assert.match(panel, /Nästa timer:/);
});
