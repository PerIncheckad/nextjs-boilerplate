import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const planning = readFileSync('app/planning/planning-workspace.tsx', 'utf8');
const planningCss = readFileSync('app/planning/planning-workspace.module.css', 'utf8');
const garage = readFileSync('app/garage/page.tsx', 'utf8');
const garageCss = readFileSync('app/garage/garage-workspace.module.css', 'utf8');

test('Planning exposes a visible three-step operating flow without changing business components', () => {
  assert.match(planning, /1\. Beslutsstöd/);
  assert.match(planning, /2\. Beslut/);
  assert.match(planning, /3\. Handslag/);
  assert.match(planning, /<SaluOverview/);
  assert.match(planning, /<FleetPlanningClient/);
  assert.match(planning, /<OrderExportButton/);
  assert.match(planning, /<PlanningGarageHandoff/);
});

test('Garage exposes the reduced-click operating sequence with the work surface first', () => {
  assert.match(garage, /1\. Garage/);
  assert.match(garage, /2\. Ny bil/);
  assert.match(garage, /3\. Avveckla/);
  assert.match(garage, /4\. Kontrollpunkter/);
  const garagePosition = garage.indexOf('<GarageClient');
  const nybilPosition = garage.indexOf('<GarageV2Panel');
  const avvecklaPosition = garage.indexOf('<OrderWorkflowPanel');
  const controlsPosition = garage.indexOf('<GarageWheelChangePanel');
  assert.ok(garagePosition >= 0 && garagePosition < nybilPosition);
  assert.ok(nybilPosition < avvecklaPosition);
  assert.ok(avvecklaPosition < controlsPosition);
});

test('refinement is navigation and grouping only', () => {
  for (const source of [planning, garage, planningCss, garageCss]) {
    assert.doesNotMatch(source, /fetch\(/);
    assert.doesNotMatch(source, /method:\s*['\"](?:POST|PATCH|PUT|DELETE)/);
    assert.doesNotMatch(source, /SUPABASE/);
  }
  assert.match(planningCss, /scroll-margin-top/);
  assert.match(garageCss, /scroll-margin-top/);
});
