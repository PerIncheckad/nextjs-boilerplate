import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync('app/api/garage/core/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-core-panel.tsx', 'utf8');
const page = readFileSync('app/garage/page.tsx', 'utf8');

test('Garage Core reads only Garage episodes plus verified receiving state', () => {
  assert.match(api, /from\('garage_items'\)/);
  assert.match(api, /from\('garage_avveckla_cases'\)/);
  assert.match(api, /handed_off_nybil_id/);
  assert.match(api, /source_planning_cell_id/);
  assert.match(api, /source_salu_flag_id/);
  assert.match(api, /source_legacy_entry_id/);
  assert.match(api, /source_journey_period_id/);
  assert.doesNotMatch(api, /garage_wheel_changes/);
  assert.doesNotMatch(api, /period_type.*DOWNTIME/);
  assert.doesNotMatch(api, /salu_flags/);
  assert.doesNotMatch(api, /insert\(/);
  assert.doesNotMatch(api, /update\(/);
  assert.doesNotMatch(api, /delete\(/);
  assert.doesNotMatch(api, /rpc\(/);
});

test('direction determines only the locked next receiver', () => {
  assert.match(api, /item\.garage_direction === 'IN' \? 'NYBIL'/);
  assert.match(api, /item\.garage_direction === 'UT' \? 'AVVECKLA'/);
  assert.match(api, /MOTTAGEN I NYBIL/);
  assert.match(api, /AVVECKLA PÅGÅR/);
  assert.match(api, /AVVECKLA EJ STARTAD/);
  assert.match(api, /VÄNTAR PÅ NYBIL/);
});

test('Garage Core preserves exact provenance instead of manufacturing source truth', () => {
  assert.match(api, /source_planning_cell_id/);
  assert.match(api, /source_planning_unit_no/);
  assert.match(api, /source_salu_flag_id/);
  assert.match(api, /source_legacy_entry_id/);
  assert.match(panel, /SOURCE \/ PROVENANCE/);
  assert.match(panel, /Layer1 period/);
});

test('Garage Core is the primary Garage image and does not reintroduce moved modules', () => {
  assert.match(page, /00 \/ GARAGE CORE/);
  assert.match(page, /<GarageCorePanel/);
  assert.doesNotMatch(page, /GarageOverviewPanel/);
  assert.doesNotMatch(page, /GarageWheelChangePanel/);
  assert.doesNotMatch(page, /LegacyCurrentStatePanel/);
  assert.doesNotMatch(page, /Inhyrd/);
  assert.doesNotMatch(page, /Salu.*Panel/);
});

test('Nybil stays read-only in Garage and AVVECKLA work stays outside Garage after verified start', () => {
  assert.match(page, /Read-only status för Garage → Nybil/);
  assert.match(page, /fortsatt arbete sker i \/avveckla/);
  assert.match(panel, /ÖPPNA \{item\.next_owner\}/);
  assert.doesNotMatch(panel, /START_CASE/);
  assert.doesNotMatch(panel, /method:\s*['\"]POST['\"]/);
});

test('legacy OrderWorkflow is not part of Garage Core or operative Garage after H', () => {
  assert.doesNotMatch(page, /OrderWorkflowPanel/);
  assert.doesNotMatch(page, /04 \/ BESTÄLLNING \/ LEVERANS/);
  assert.doesNotMatch(api, /confirmation_status/);
  assert.doesNotMatch(api, /transport_status/);
  assert.doesNotMatch(api, /supplier/);
  assert.doesNotMatch(api, /order_reference/);
});
