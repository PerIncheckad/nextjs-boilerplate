import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ET_PRICE_LIST_VERSION, assertEtPriceListShape, quoteEtPrice } from '../lib/et-price-list-2026';

const migration = readFileSync('migrations/20260903004000_add_garage_avveckla_billable_driving_v1.sql', 'utf8');
const completeApi = readFileSync('app/api/garage/avveckla/complete/route.ts', 'utf8');
const billingApi = readFileSync('app/api/billing/driving/route.ts', 'utf8');
const panel = readFileSync('app/garage/garage-avveckla-panel.tsx', 'utf8');

test('ET Prislista 2026 is structurally complete and frozen to exported version', () => {
  assert.doesNotThrow(() => assertEtPriceListShape());
  assert.equal(ET_PRICE_LIST_VERSION, '2026-01-29');
  assert.equal(quoteEtPrice({ fromLocation: 'Malmö', toLocation: 'Malmö', priceClass: '1.0' }).price, 953);
  assert.equal(quoteEtPrice({ fromLocation: 'Halmstad', toLocation: 'Halmstad', priceClass: '2.0' }).price, 2604);
  assert.equal(quoteEtPrice({ fromLocation: 'Malmö', toLocation: 'Helsingborg', priceClass: '1.3' }).price, 1480.7);
  assert.equal(quoteEtPrice({ fromLocation: 'Malmö', toLocation: 'Kiruna', priceClass: 'OFFERT', quotedPrice: 12345 }).price, 12345);
});

test('billable driving is a unique economic afterlife sourced from immutable own-delivery UT', () => {
  assert.match(migration, /create table if not exists public\.billable_driving_events/i);
  assert.match(migration, /source_event_id uuid not null unique references public\.garage_avveckla_events/i);
  assert.match(migration, /event_type text not null default 'FAKTURERBAR_KORNING'/i);
  assert.match(migration, /price_list_id text not null/i);
  assert.match(migration, /price_list_version text not null/i);
  assert.match(migration, /billing_status text not null default 'EJ_FAKTURERAD'/i);
  assert.match(migration, /'EJ_FAKTURERAD','FAKTURAUNDERLAG','FAKTURERAD'/i);
});

test('own delivery delegates to the locked B terminal and creates billing from its completion event', () => {
  assert.match(migration, /function public\.verify_garage_avveckla_egen_leverans_with_billing/i);
  assert.match(migration, /public\.complete_garage_avveckla_ut_internal\(/i);
  assert.doesNotMatch(migration, /assert_garage_avveckla_ready_for_completion\(/i);
  assert.match(migration, /v_source_event_id := \(v_result ->> 'completion_event_id'\)::uuid/i);
  assert.match(migration, /insert into public\.billable_driving_events/i);
  assert.match(migration, /if not p_is_billable then[\s\S]*return v_result/i);
});

test('operational API requires explicit billable yes/no only for own delivery and prices server-side', () => {
  assert.match(completeApi, /typeof body\.billable_driving !== 'boolean'/);
  assert.match(completeApi, /quoteEtPrice\(/);
  assert.match(completeApi, /verify_garage_avveckla_egen_leverans_with_billing/);
  assert.match(completeApi, /EXTERN_TRANSPORT: 'verify_garage_avveckla_extern_transport'/);
  assert.match(completeApi, /AVSTALLNING: 'verify_garage_avveckla_avstallning'/);
  assert.doesNotMatch(completeApi, /p_is_billable[\s\S]*EXTERN_TRANSPORT/);
});

test('Garage UI never silently assumes whether own delivery is billable', () => {
  assert.match(panel, /type BillableChoice = '' \| 'YES' \| 'NO'/);
  assert.match(panel, /Fakturerbar körning\?/);
  assert.match(panel, /Välj Ja \/ Nej/);
  assert.match(panel, /FRÅN/);
  assert.match(panel, /TILL/);
  assert.match(panel, /Bilplats \/ prisklass/);
  assert.match(panel, /ET_PRICE_LOCATIONS/);
  assert.match(panel, /ET_PRICE_CLASSES/);
});

test('billing lifecycle is sequential and invoice evidence is required', () => {
  assert.match(migration, /v_event\.billing_status = 'EJ_FAKTURERAD' and p_target_status = 'FAKTURAUNDERLAG'/i);
  assert.match(migration, /v_event\.billing_status = 'FAKTURAUNDERLAG' and p_target_status = 'FAKTURERAD'/i);
  assert.match(migration, /Fakturanummer och fakturadatum krävs/i);
  assert.match(billingApi, /transition_billable_driving_event/);
  assert.match(billingApi, /targetStatus === 'FAKTURERAD'/);
});

test('billing business facts and history cannot be rewritten or deleted', () => {
  assert.match(migration, /Den ekonomiska körningshändelsens affärsfakta är frysta/i);
  assert.match(migration, /Fakturerbar körning får inte raderas/i);
  assert.match(migration, /Ekonomisk körningshistorik är append-only/i);
  assert.match(migration, /old\.billing_status = 'FAKTURERAD'/i);
});
