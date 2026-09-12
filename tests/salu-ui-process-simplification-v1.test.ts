import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPERATIONAL_NAVIGATION_ITEMS } from '../components/operational-navigation-contract';

const migration = readFileSync('migrations/20260906043000_simplify_salu_decision_ui_v1.sql', 'utf8');
const api = readFileSync('app/api/salu/decision/route.ts', 'utf8');
const ui = readFileSync('app/salu/salu-decision-client.tsx', 'utf8');

const saluGarage = readFileSync('migrations/20260906023000_add_salu_saljas_to_garage_ut_handoff_v1.sql', 'utf8');

// One operator action may orchestrate the old audited states, never delete them.
test('one-action wrapper preserves audited SALU transitions and readiness', () => {
  assert.match(migration, /function public\.decide_salu_flag_v1/i);
  assert.match(migration, /public\.acknowledge_salu_flag_v1\(p_flag_id, p_actor_id\)/i);
  assert.match(migration, /public\.move_salu_flag_to_final_assessment_v1\(p_flag_id, p_actor_id\)/i);
  assert.match(migration, /public\.close_salu_flag_manually_v2\(/i);
  assert.match(migration, /v_flag\.status = 'NY'/i);
  assert.match(migration, /v_flag\.status in \('HANDLÄGGS', 'VÄNTAR'\)/i);
  assert.match(migration, /v_flag\.status <> 'SLUTBEDÖMNING'/i);
});

test('wrapper remains server-only and does not own downstream modules', () => {
  assert.match(migration, /revoke all on function public\.decide_salu_flag_v1[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.decide_salu_flag_v1[\s\S]*service_role/i);
  assert.doesNotMatch(migration, /insert into public\.garage_items/i);
  assert.doesNotMatch(migration, /start_garage_avveckla_case/i);
  assert.doesNotMatch(migration, /vehicle_journey_periods/i);
  assert.doesNotMatch(migration, /vehicle_edits/i);
});

test('authenticated API exposes one decision call', () => {
  assert.match(api, /verifyApiUser\(request\)/);
  assert.match(api, /rpc\('decide_salu_flag_v1'/);
  assert.match(api, /closure_outcome/);
  assert.match(api, /new_saludatum/);
});

test('UI shows blockers and the five locked final decisions without workflow buttons', () => {
  for (const decision of ['SÄLJAS', 'FÖRLÄNGA', 'PLANERA VERKSTAD', 'LÅNGTID PLANERA SKIFTE', 'ANNAT']) {
    assert.match(ui, new RegExp(decision));
  }
  assert.match(ui, /Kan inte avslutas ännu/);
  assert.match(ui, /Fatta beslut/);
  assert.doesNotMatch(ui, />Kvittera</);
  assert.doesNotMatch(ui, />HANDLÄGGS</);
  assert.doesNotMatch(ui, /Gå till slutbedömning/);
});

test('SALU is exposed as an operational workspace and SÄLJAS handoff remains unchanged', () => {
  assert.deepEqual(
    OPERATIONAL_NAVIGATION_ITEMS.find(({ href }) => href === '/salu'),
    { href: '/salu', label: 'SALU' },
  );
  assert.match(saluGarage, /nextAction', 'START_AVVECKLA_MANUALLY'/);
  assert.match(saluGarage, /avvecklaStarted', false/);
  assert.doesNotMatch(saluGarage, /(?:perform|select)\s+public\.start_garage_avveckla_case\s*\(/i);
});
