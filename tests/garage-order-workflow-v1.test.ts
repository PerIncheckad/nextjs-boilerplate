import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync('app/garage/order-workflow-panel.tsx', 'utf8');
const page = readFileSync('app/garage/page.tsx', 'utf8');
const api = readFileSync('app/api/garage/route.ts', 'utf8');

test('Garage order workflow is mounted and uses existing authenticated Garage API', () => {
  assert.match(page, /OrderWorkflowPanel/);
  assert.match(panel, /fetch\('\/api\/garage'/);
  assert.match(panel, /method:\s*'PATCH'/);
  assert.match(api, /verifyApiUser/);
  assert.match(api, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('confirmation workflow exposes only existing explicit statuses', () => {
  for (const status of ['PLANERAD', 'BESTALLD', 'AVROPAD', 'AVVAKTAR_BEKRAFTELSE', 'BEKRAFTAD']) {
    assert.match(panel, new RegExp(status));
    assert.match(api, new RegExp(status));
  }
});

test('transport workflow exposes only existing explicit statuses', () => {
  for (const status of ['EJ_BOKAD', 'TRANSPORTBOKAD', 'PA_VAG']) {
    assert.match(panel, new RegExp(status));
    assert.match(api, new RegExp(status));
  }
});

test('order workflow does not invent automatic transitions or dates', () => {
  assert.match(panel, /Systemet sätter inga datum eller nästa status automatiskt/);
  assert.doesNotMatch(panel, /setTimeout|setInterval/);
  assert.doesNotMatch(panel, /ordered_at:\s*new Date/);
  assert.doesNotMatch(panel, /calloff_at:\s*new Date/);
  assert.doesNotMatch(panel, /planned_delivery_date:\s*new Date/);
});

test('workflow provides control totals and filters without schema changes', () => {
  for (const label of ['TOTALT', 'BESTÄLLDA', 'AVVAKTAR BEKRÄFTELSE', 'BEKRÄFTADE', 'PÅ VÄG']) assert.match(panel, new RegExp(label));
  assert.match(panel, /confirmationFilter/);
  assert.match(panel, /transportFilter/);
});
