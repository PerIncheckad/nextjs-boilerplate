import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(
  join(process.cwd(), 'app/api/salu/plan/route.ts'),
  'utf8',
);

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260820_add_salu_plan_rpc.sql'),
  'utf8',
);

test('SALU plan write endpoint is authenticated and disabled by default', () => {
  assert.match(route, /verifyApiUser\(request\)/);
  assert.match(route, /process\.env\.SALU_WRITES_ENABLED !== 'true'/);
  assert.match(route, /status: 503/);
});

test('SALU plan endpoint keeps human MANUELL precedence and explicit AUTO fallback behavior', () => {
  assert.match(route, /mode === 'MANUELL'/);
  assert.match(route, /manualMonths must be a positive integer/);
  assert.match(route, /calculateAutoSaludatum/);
  assert.match(route, /No AUTO rule matched; MANUELL is required/);
});

test('SALU plan endpoint validates a real calendar NY date and does not use explicit any for AUTO rows', () => {
  assert.match(route, /isValidIsoDate\(nyDate\)/);
  assert.match(route, /type SaluAutoRuleRow/);
  assert.doesNotMatch(route, /row:\s*any/);
});

test('SALU plan persistence uses one atomic RPC instead of separate state and audit writes', () => {
  assert.match(route, /\.rpc\('apply_salu_vehicle_plan'/);
  assert.doesNotMatch(route, /from\('salu_vehicle_state'\)\.upsert/);
  assert.doesNotMatch(route, /from\('salu_events'\)\.insert/);
});

test('atomic plan RPC preserves original saludatum and appends audit on actual change', () => {
  assert.match(migration, /v_original := coalesce\(v_existing_original, p_saludatum\)/);
  assert.match(migration, /original_saludatum = public\.salu_vehicle_state\.original_saludatum/);
  assert.match(migration, /v_existing_current is distinct from p_saludatum/);
  assert.match(migration, /'SALU_SALUDATUM_CHANGED'/);
});

test('atomic plan RPC keeps NY immutable and synchronizes an active flag without changing cycle identity', () => {
  assert.match(migration, /NY date cannot be changed through SALU plan update/);
  assert.match(migration, /where f\.regnr = p_regnr[\s\S]*f\.status <> 'STÄNGD'/);
  assert.match(migration, /update public\.salu_flags[\s\S]*current_saludatum = p_saludatum/);
  assert.match(migration, /escalation_status = v_escalation_status/);
  assert.doesNotMatch(migration, /cycle_saludatum\s*=\s*p_saludatum/);
});

test('active plan changes can move escalation backwards while history remains append-only', () => {
  assert.match(migration, /p_saludatum <= current_date[\s\S]*'PASSERAD'/);
  assert.match(migration, /p_saludatum <= current_date \+ 10[\s\S]*'T10'/);
  assert.match(migration, /v_escalation_status := 'NORMAL'/);
  assert.match(migration, /flag_id,[\s\S]*v_active_flag_id,[\s\S]*'SALU_SALUDATUM_CHANGED'/);
});

test('atomic plan RPC is server-only', () => {
  assert.match(migration, /revoke all on function public\.apply_salu_vehicle_plan[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.apply_salu_vehicle_plan[\s\S]*to service_role/i);
});
