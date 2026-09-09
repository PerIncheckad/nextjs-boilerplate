import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/garage/page.tsx', 'utf8');
const api = readFileSync('app/api/garage/route.ts', 'utf8');
const deadPanelPath = 'app/garage/order-workflow-panel.tsx';

test('legacy OrderWorkflow UI stays removed from operative Garage', () => {
  assert.equal(existsSync(deadPanelPath), false, `${deadPanelPath} must stay removed`);
  assert.doesNotMatch(page, /OrderWorkflowPanel/);
  assert.doesNotMatch(page, /BESTÄLLNING \/ LEVERANS/);
  assert.doesNotMatch(page, /bestallning-leverans/);
  assert.match(page, /GARAGE CORE/);
  assert.match(page, /STAGING \/ ROUTING \/ HANDOFF/);
});

test('legacy order and transport data remain API-compatible historical/source fields', () => {
  for (const field of ['supplier', 'order_reference', 'ordered_at', 'calloff_at', 'confirmation_status', 'transport_status']) {
    assert.match(api, new RegExp(field));
  }
  for (const status of ['PLANERAD', 'BESTALLD', 'AVROPAD', 'AVVAKTAR_BEKRAFTELSE', 'BEKRAFTAD']) {
    assert.match(api, new RegExp(status));
  }
  for (const status of ['EJ_BOKAD', 'TRANSPORTBOKAD', 'PA_VAG']) {
    assert.match(api, new RegExp(status));
  }
  assert.match(api, /verifyApiUser/);
});