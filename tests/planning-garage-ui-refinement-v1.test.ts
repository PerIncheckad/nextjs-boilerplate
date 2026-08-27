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

test('Garage exposes the operating sequence from handoff through detailed objects', () => {
  assert.match(garage, /1\. Överlämningar/);
  assert.match(garage, /2\. Orderflöde/);
  assert.match(garage, /3\. Kontrollpunkter/);
  assert.match(garage, /4\. Garage-objekt/);
  assert.match(garage, /<GarageV2Panel/);
  assert.match(garage, /<OrderWorkflowPanel/);
  assert.match(garage, /<GarageWheelChangePanel/);
  assert.match(garage, /<GarageClient/);
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
