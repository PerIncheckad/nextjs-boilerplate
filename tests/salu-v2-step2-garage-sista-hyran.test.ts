import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const step2 = readFileSync('migrations/20260915181000_salu_v2_step2_garage_sista_hyran.sql', 'utf8');
const identity = readFileSync('migrations/20260915182500_salu_v2_step2_employee_identity_boundary.sql', 'utf8');
const garageApi = readFileSync('app/api/garage/route.ts', 'utf8');
const saluGarageApi = readFileSync('app/api/garage/salu-planning/route.ts', 'utf8');
const garageUi = readFileSync('app/garage/garage-client.tsx', 'utf8');
const saluGarageUi = readFileSync('app/garage/garage-salu-planning.tsx', 'utf8');
const step1 = readFileSync('migrations/20260915133000_salu_v2_step1_planning_garage_handoff.sql', 'utf8');
const garageSources = readFileSync('migrations/20260826014500_add_garage_v2_handoffs.sql', 'utf8');
const historicalSalu = readFileSync('migrations/20260908100500_lock_salu_garage_direction_ut_v1.sql', 'utf8');

test('SALU_PLANERING is a dedicated directionless Garage work responsibility', () => {
  assert.match(garageUi, /'SALU_PLANERING'/);
  assert.match(garageUi, /SALU PLANERING/);
  assert.match(garageUi, /item\.source_kind === 'SALU_PLANERING'\) return false/);
  assert.match(saluGarageUi, /INGEN FYSISK IN\/UT/);
  assert.match(step2, /garage_items_salu_planning_directionless_chk/);
  assert.match(step2, /source_kind <> 'SALU_PLANERING'\s+or garage_direction is null/);
});

test('generic Garage PATCH cannot mutate SALU_PLANERING or fabricate IN UT', () => {
  assert.match(garageApi, /activeItem\.source_kind === 'SALU_PLANERING'/);
  assert.match(garageApi, /generic Garage-PATCH får inte ändra objektet/);
  assert.match(saluGarageApi, /Object\.hasOwn\(body, 'garage_direction'\)/);
  assert.match(saluGarageApi, /SALU PLANERING får inte ges fysisk IN\/UT-riktning/);
});

test('Garage complements preserve original SALU plan and have append-only provenance', () => {
  assert.match(step2, /create table public\.garage_salu_operational_events/);
  assert.match(step2, /salu_plan_id uuid not null references public\.salu_plans/);
  assert.match(step2, /garage_salu_operational_events is append-only/);
  assert.match(step2, /salu_final_timing_at/);
  assert.match(step2, /salu_transport_details/);
  assert.match(step2, /salu_repair_destination/);
  assert.match(step2, /salu_operational_note/);
  assert.doesNotMatch(step2, /update public\.salu_plans/i);
  assert.match(saluGarageApi, /from\('salu_plans'\)/);
});

test('SISTA HYRAN is explicit, versioned and never inferred from dates', () => {
  assert.match(step2, /create table public\.garage_sista_hyran_decisions/);
  assert.match(step2, /decision_status text not null default 'SISTA HYRAN'/);
  assert.match(step2, /decision_version integer not null/);
  assert.match(step2, /idempotency_key/);
  assert.match(step2, /supersedes_decision_id/);
  assert.match(step2, /create or replace view public\.garage_sista_hyran_current/);
  assert.match(saluGarageApi, /action\)\?\.toUpperCase\(\) !== 'SISTA_HYRAN'/);
  assert.match(saluGarageUi, /Ett datum är endast beslutsunderlag/);
  assert.doesNotMatch(step2, /trigger[\s\S]{0,160}sista_hyran[\s\S]{0,160}salu_final_timing_at/i);
});

test('SISTA HYRAN uses exact Layer 2.5 mandate contract and no person seed', () => {
  assert.match(step2, /'GARAGE_SISTA_HYRAN_DECIDE'/);
  assert.match(identity, /'GARAGE_SISTA_HYRAN_DECIDE'/);
  assert.match(identity, /'BILKONTROLLCHEF'/);
  assert.match(identity, /'PROCESS'/);
  assert.match(identity, /'SALU'/);
  assert.doesNotMatch(step2, /insert into public\.employee_mandates/i);
  assert.doesNotMatch(identity, /insert into public\.employee_mandates/i);
  assert.doesNotMatch(step2, /BILKONTROLLANSVARIG/);
  assert.doesNotMatch(identity, /BILKONTROLLANSVARIG/);
  assert.doesNotMatch(identity, /ACCESS_GARAGE/);
});

test('auth UUID is provenance only and employee identity is resolved deny-by-default', () => {
  assert.match(identity, /resolve_active_employee_identity_v1/);
  assert.match(identity, /v_count <> 1/);
  assert.match(identity, /v_employee_id := public\.resolve_active_employee_identity_v1\(p_actor_email\)/);
  assert.match(identity, /assert_actor_process_mandate\(\s*v_employee_id/s);
  assert.match(saluGarageApi, /resolve_active_employee_identity_v1/);
  assert.match(saluGarageApi, /p_employee_id: employeeId/);
  assert.match(saluGarageApi, /p_actor_email: verification\.user\.email/);
  assert.match(saluGarageApi, /p_auth_user_id: verification\.user\.id/);
  assert.doesNotMatch(saluGarageApi, /p_employee_id:\s*verification\.user\.id/);
  assert.doesNotMatch(saluGarageApi, /p_employee_id:\s*body\./);
});

test('Step 2 does not enter Step 3 or terminal decommissioning semantics', () => {
  for (const source of [step2, identity, saluGarageApi, saluGarageUi]) {
    assert.doesNotMatch(source, /start_garage_avveckla_case/i);
    assert.doesNotMatch(source, /canonical_fleet.*exit/i);
    assert.doesNotMatch(source, /checkin.*insert/i);
    assert.doesNotMatch(source, /update public\.salu_flags[\s\S]*STÄNGD/i);
  }
  assert.match(identity, /'terminalClosure', false/);
  assert.match(identity, /'avvecklaStarted', false/);
  assert.match(identity, /'canonicalFleetExit', false/);
  assert.match(identity, /'checkinWritten', false/);
});

test('legacy Garage contracts remain independent from SALU_PLANERING', () => {
  assert.match(garageSources, /'MANUELL'::text, 'PLANERING'::text, 'SALU'::text, 'LAGER1'::text/);
  assert.match(historicalSalu, /source_kind = 'SALU'[\s\S]*garage_direction is not distinct from 'UT'/i);
  assert.match(step1, /'SALU_PLANERING'/);
  assert.doesNotMatch(step2, /drop constraint if exists garage_items_salu_source_direction_ut_chk/i);
  assert.doesNotMatch(step2, /garage_direction\s*=\s*'IN'/i);
  assert.doesNotMatch(step2, /garage_direction\s*=\s*'UT'/i);
});

test('Garage work surface reuses source-owned vehicle readers', () => {
  assert.match(saluGarageUi, /\/api\/vehicle-journey\?reg=/);
  assert.match(saluGarageUi, /\/vagnkort\?reg=/);
  assert.doesNotMatch(saluGarageUi, /from\(['"]damages['"]\)/);
  assert.doesNotMatch(saluGarageUi, /from\(['"]vehicle_journey_events['"]\)/);
});
