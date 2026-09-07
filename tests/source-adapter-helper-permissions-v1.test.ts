import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260907202000_harden_source_adapter_helper_permissions_v1.sql'),
  'utf8',
);
const nybil = readFileSync(
  join(process.cwd(), 'migrations/20260821144700_add_nybil_period_write_through.sql'),
  'utf8',
);
const status = readFileSync(
  join(process.cwd(), 'migrations/20260821125500_add_vehicle_status_period_write_through.sql'),
  'utf8',
);
const checkin = readFileSync(
  join(process.cwd(), 'migrations/20260821153000_add_checkin_downtime_period_write_through.sql'),
  'utf8',
);
const replay = readFileSync(
  join(process.cwd(), 'migrations/20260823111500_add_post_rental_source_replay_v1.sql'),
  'utf8',
);
const avveckla = readFileSync(
  join(process.cwd(), 'migrations/20260902233000_add_garage_avveckla_terminal_handoffs_v1.sql'),
  'utf8',
);

const signatures = [
  'try_write_through_nybil_period\\(uuid, text, boolean, timestamptz, text, boolean\\)',
  'try_write_through_vehicle_status_period\\(bigint, text, text, text, timestamptz, text, text, text\\)',
  'try_write_through_checkin_downtime_period\\(uuid, text, text, timestamptz, jsonb, uuid, text\\)',
  'close_vehicle_journey_period_from_source\\(uuid, text, timestamptz, text, text, text, uuid, text, text\\)',
];

function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...collectSourceFiles(path));
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) files.push(path);
  }
  return files;
}

const appSource = collectSourceFiles(join(process.cwd(), 'app'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

test('all four source-adapter helpers lose direct EXECUTE for runtime-facing roles', () => {
  for (const signature of signatures) {
    assert.match(
      migration,
      new RegExp(`revoke execute on function public\\.${signature}[\\s\\S]*from public, anon, authenticated, service_role`, 'i'),
    );
  }
});

test('permission migration changes no function body, trigger, schema or data', () => {
  assert.doesNotMatch(migration, /create or replace function/i);
  assert.doesNotMatch(migration, /create\s+trigger|drop\s+trigger/i);
  assert.doesNotMatch(migration, /alter\s+table|create\s+table|drop\s+table/i);
  assert.doesNotMatch(migration, /insert\s+into|update\s+public\.|delete\s+from/i);
  assert.doesNotMatch(migration, /grant\s+execute/i);
});

test('Nybil parent chain remains trigger-owned and calls the internal helper', () => {
  assert.match(nybil, /create trigger nybil_period_write_through[\s\S]*execute function public\.write_through_nybil_period\(\)/i);
  assert.match(nybil, /function public\.write_through_nybil_period\(\)[\s\S]*security definer[\s\S]*try_write_through_nybil_period\(/i);
});

test('Status live and replay parent chains remain source-owned', () => {
  assert.match(status, /create trigger vehicle_status_period_write_through[\s\S]*execute function public\.write_through_vehicle_status_periods\(\)/i);
  assert.match(status, /function public\.write_through_vehicle_status_periods\(\)[\s\S]*security definer[\s\S]*try_write_through_vehicle_status_period\(/i);
  assert.match(status, /function public\.replay_vehicle_status_period_write_through\([\s\S]*security definer[\s\S]*from public\.vehicle_edits[\s\S]*try_write_through_vehicle_status_period\(/i);
});

test('Check-in live and replay parent chains remain source-owned', () => {
  assert.match(checkin, /create trigger checkin_downtime_period_write_through[\s\S]*execute function public\.write_through_checkin_downtime_period\(\)/i);
  assert.match(checkin, /function public\.write_through_checkin_downtime_period\(\)[\s\S]*security definer[\s\S]*try_write_through_checkin_downtime_period\(/i);
  assert.match(replay, /function public\.replay_checkin_downtime_period_write_through\([\s\S]*security definer[\s\S]*from public\.checkins[\s\S]*try_write_through_checkin_downtime_period\(/i);
});

test('AVVECKLA parent still creates source evidence before internal source-aware close', () => {
  assert.match(avveckla, /function public\.complete_garage_avveckla_ut_internal\([\s\S]*security definer/i);
  assert.match(avveckla, /insert into public\.garage_avveckla_events[\s\S]*returning event_id into v_event_id[\s\S]*close_vehicle_journey_period_from_source\(/i);
});

test('current app code has no direct RPC caller for any internal helper', () => {
  for (const fn of [
    'try_write_through_nybil_period',
    'try_write_through_vehicle_status_period',
    'try_write_through_checkin_downtime_period',
    'close_vehicle_journey_period_from_source',
  ]) {
    assert.doesNotMatch(appSource, new RegExp(`\\.rpc\\(\\s*['\"]${fn}['\"]`, 'i'));
  }
});

test('already-closed generic transition and unrelated contracts are not touched', () => {
  assert.doesNotMatch(migration, /transition_vehicle_journey_state/i);
  assert.doesNotMatch(migration, /rental_operational_facts/i);
  assert.doesNotMatch(migration, /SALU|OTHER/i);
});
