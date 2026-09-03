import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('app/garage/page.tsx', 'utf8');
const panel = readFileSync('app/garage/garage-avveckla-transport-booking-panel.tsx', 'utf8');
const hardening = readFileSync('migrations/20260903011000_harden_garage_avveckla_terminal_entrypoints_v1.sql', 'utf8');

test('Garage exposes an operator path for real TRANSPORT_BOKAD before the legacy order workflow', () => {
  assert.match(page, /GarageAvvecklaTransportBookingPanel/);
  assert.match(page, /<GarageAvvecklaPanel \/>[\s\S]*<GarageAvvecklaTransportBookingPanel \/>[\s\S]*<OrderWorkflowPanel \/>/);
});

test('transport booking UI reads frozen booking state and registers through authenticated API contract', () => {
  assert.match(panel, /\/api\/garage\/avveckla\/transport\?garage_item_id=/);
  assert.match(panel, /method: 'POST'/);
  assert.match(panel, /booked_at: bookedAt/);
  assert.match(panel, /booking_reference: bookingReference/);
  assert.match(panel, /Registrera transportbokning/);
  assert.match(panel, /Deadline:/);
  assert.match(panel, /AVVIKELSE \+ LARM/);
  assert.match(panel, /Starta AVVECKLA-ärendet för bilen innan transport bokas/);
});

test('service_role cannot bypass Step D billing decision through old own-delivery or generic terminal entrypoint', () => {
  assert.match(hardening, /revoke execute on function public\.complete_garage_avveckla_ut_internal\(uuid,text,timestamptz,text,uuid,text\) from service_role/i);
  assert.match(hardening, /revoke execute on function public\.verify_garage_avveckla_egen_leverans\(uuid,timestamptz,text,uuid,text\) from service_role/i);
  assert.match(hardening, /grant execute on function public\.verify_garage_avveckla_egen_leverans_with_billing/i);
  assert.match(hardening, /grant execute on function public\.verify_garage_avveckla_extern_transport/i);
  assert.match(hardening, /grant execute on function public\.verify_garage_avveckla_avstallning/i);
});
