import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const planning = readFileSync('app/planning/planning-workspace.tsx', 'utf8');
const planningHandoff = readFileSync('app/planning/planning-garage-handoff.tsx', 'utf8');
const planningCss = readFileSync('app/planning/planning-workspace.module.css', 'utf8');
const garage = readFileSync('app/garage/page.tsx', 'utf8');
const garageClient = readFileSync('app/garage/garage-client.tsx', 'utf8');
const garageCss = readFileSync('app/garage/garage-workspace.module.css', 'utf8');
const hjulskifte = readFileSync('app/hjulskifte/page.tsx', 'utf8');

test('Planning exposes a visible three-step operating flow without changing business components', () => {
  assert.match(planning, /1\. Beslutsstöd/);
  assert.match(planning, /2\. Beslut/);
  assert.match(planning, /3\. Handslag/);
  assert.match(planning, /<SaluOverview/);
  assert.match(planning, /<FleetPlanningClient/);
  assert.match(planning, /<OrderExportButton/);
  assert.match(planning, /<PlanningGarageHandoff/);
});

test('Garage exposes its reduced operating sequence without Hjulskifte execution', () => {
  assert.match(garage, /1\. Garage/);
  assert.match(garage, /2\. Ny bil/);
  assert.match(garage, /3\. Avveckla/);
  const garagePosition = garage.indexOf('<GarageClient');
  const nybilPosition = garage.indexOf('<GarageV2Panel');
  const avvecklaPosition = garage.indexOf('<OrderWorkflowPanel');
  assert.ok(garagePosition >= 0 && garagePosition < nybilPosition);
  assert.ok(nybilPosition < avvecklaPosition);
  assert.doesNotMatch(garage, /GarageWheelChangePanel/);
  assert.doesNotMatch(garage, /KONTROLLPUNKTER/);
  assert.match(hjulskifte, /<HjulskiftePanel/);
});

test('Planning handoff opens Garage directly in the selected month and UTVECKLA direction', () => {
  assert.match(planningHandoff, /\/garage\?period=\$\{period\}&direction=IN/);
  assert.match(garageClient, /useSearchParams/);
  assert.match(garageClient, /searchParams\.get\('period'\)/);
  assert.match(garageClient, /searchParams\.get\('direction'\)/);
  assert.match(garageClient, /useState\(MONTH_RE\.test\(requestedPeriod\) \? requestedPeriod : ''\)/);
  assert.match(garageClient, /useState<'ALLA' \| GarageDirection>\(requestedDirection\)/);
});

test('refinement is navigation and grouping only', () => {
  for (const source of [planning, garage, hjulskifte, planningCss, garageCss]) {
    assert.doesNotMatch(source, /method:\s*['\"](?:POST|PATCH|PUT|DELETE)/);
    assert.doesNotMatch(source, /SUPABASE/);
  }
  assert.match(planningCss, /scroll-margin-top/);
  assert.match(garageCss, /scroll-margin-top/);
});
