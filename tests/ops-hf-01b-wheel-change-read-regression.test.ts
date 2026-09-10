import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const route = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');

test('terminal UT wheel read uses the event -> owning AVVECKLA case relation explicitly', () => {
  assert.match(
    route,
    /garage_avveckla_cases!garage_avveckla_events_avveckla_case_id_fkey!inner\(regnr\)/,
  );
  assert.doesNotMatch(route, /garage_avveckla_cases!inner\(regnr\)/);
  assert.doesNotMatch(route, /garage_avveckla_cases_completion_event_fkey!inner\(regnr\)/);
});

test('terminal UT lookup remains read-only', () => {
  const functionBody = route.match(/async function readTerminalUtRegnrs[\s\S]*?\n}\n\nasync function readRegisteredWheelStorage/)?.[0] ?? '';
  assert.match(functionBody, /\.from\('garage_avveckla_events'\)/);
  assert.match(functionBody, /\.eq\('event_type', 'UT_OVERLAMNING_VERIFIERAD'\)/);
  assert.doesNotMatch(functionBody, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});
