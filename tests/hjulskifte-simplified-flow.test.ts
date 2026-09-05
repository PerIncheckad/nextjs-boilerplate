import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'migrations/20260905201500_simplify_hjulskifte_operator_flow.sql',
  'utf8',
);
const api = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-wheel-change-panel.tsx', 'utf8');

test('verified KLAR no longer requires PAGAENDE as an operator step', () => {
  assert.match(migration, /status = 'KRAVS' and v_next_status in \('KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE'\)/i);
  assert.match(migration, /status = 'BOKAD' and v_next_status in \('KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE'\)/i);
  assert.match(migration, /elsif v_next_status = 'KLAR' then\s+perform public\.assess_vehicle_checkpoint/i);
});

test('shortcut creates one traceable wheel-change then applies explicit BOKAD or KLAR', () => {
  assert.match(migration, /create or replace function public\.open_garage_wheel_change_for_vehicle/i);
  assert.match(migration, /v_status not in \('BOKAD', 'KLAR'\)/i);
  assert.match(migration, /public\.create_garage_wheel_change_for_vehicle/i);
  assert.match(migration, /return public\.update_garage_wheel_change/i);
});

test('API only exposes explicit BOKAD or KLAR shortcuts', () => {
  assert.match(api, /requestedStatus !== 'BOKAD' && requestedStatus !== 'KLAR'/);
  assert.match(api, /open_garage_wheel_change_for_vehicle/);
  assert.match(api, /Bokad tid krävs när hjulskiftet är BOKAD/);
});

test('operator UI is reduced to Boka and verified Klar in the normal candidate flow', () => {
  assert.match(panel, /'Bokar…' : 'Boka'/);
  assert.match(panel, /Redan utfört \/ Klar/);
  assert.match(panel, /Systemet hittar behovet\. Du bokar och bekräftar när arbetet är klart\./);
  assert.doesNotMatch(panel, /Startar…/);
});

test('legacy PAGAENDE remains readable but is not offered as a new normal transition', () => {
  assert.match(panel, /PAGAENDE: 'Pågående'/);
  assert.match(panel, /if \(item\.status === 'PAGAENDE'\) return \['PAGAENDE', 'BOKAD', 'KLAR', 'AVVIKELSE'\]/);
  assert.doesNotMatch(panel, /return \['KRAVS', 'BOKAD', 'PAGAENDE'/);
});
