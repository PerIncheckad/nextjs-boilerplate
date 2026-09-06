import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync('app/garage/order-workflow-panel.tsx', 'utf8');
const page = readFileSync('app/garage/page.tsx', 'utf8');
const api = readFileSync('app/api/garage/route.ts', 'utf8');

test('legacy OrderWorkflow is no longer mounted in operative Garage', () => {
  assert.doesNotMatch(page, /OrderWorkflowPanel/);
  assert.doesNotMatch(page, /BESTÄLLNING \/ LEVERANS/);
  assert.match(panel, /confirmation_status/);
  assert.match(panel, /transport_status/);
});

test('legacy order fields remain API-compatible for historical data until later cleanup', () => {
  for (const status of ['PLANERAD', 'BESTALLD', 'AVROPAD', 'AVVAKTAR_BEKRAFTELSE', 'BEKRAFTAD']) assert.match(api, new RegExp(status));
  for (const status of ['EJ_BOKAD', 'TRANSPORTBOKAD', 'PA_VAG']) assert.match(api, new RegExp(status));
  assert.match(api, /verifyApiUser/);
});

test('Garage operator surface no longer treats legacy confirmation and transport states as workflow', () => {
  assert.doesNotMatch(page, /<OrderWorkflowPanel/);
  assert.doesNotMatch(page, /bestallning-leverans/);
});
