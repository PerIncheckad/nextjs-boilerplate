import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const form = readFileSync('app/check/form-client.tsx', 'utf8');
const handler = readFileSync('app/api/notify/legacy-handler.ts', 'utf8');
const migration = readFileSync('migrations/20260825124500_add_checkin_fuel_receipt_outcome_v1.sql', 'utf8');
const evidenceRoute = readFileSync('app/api/operator-fuel-evidence/route.ts', 'utf8');

test('Check-in requires receipt image or explicit missing-receipt reason for tankad_nu', () => {
  assert.match(form, /receiptMissingReason/);
  assert.match(form, /Fotografera tankkvitto/);
  assert.match(form, /accept="image\/\*"/);
  assert.match(form, /capture="environment"/);
  assert.match(form, />Kvitto saknas<\/ChoiceButton>/);
  assert.match(form, /Orsak till att kvitto saknas \*/);
  assert.match(form, /!receiptMedia && !\(receiptMissing && receiptMissingReason\.trim\(\)\)/);
});

test('receipt upload failure blocks the ordinary completion path', () => {
  assert.match(form, /Receipt upload failed \(blocking\)/);
  assert.match(form, /throw new Error\('Tankkvittot kunde inte laddas upp\./);
  assert.doesNotMatch(form, /Tankkvittot kunde inte laddas upp, men incheckningen sparas/);
});

test('server rejects tankad_nu without receipt evidence or explicit deviation', () => {
  assert.match(handler, /const isNewFuelReceiptEvent = payload\.tankning\?\.tankniva === 'tankad_nu'/);
  assert.match(handler, /const hasReceiptEvidence = Boolean\(payload\.tankning_receipt\?\.file_url\)/);
  assert.match(handler, /declaredReceiptStatus === 'MISSING_WITH_REASON' && declaredMissingReason/);
  assert.match(handler, /if \(isNewFuelReceiptEvent && !fuelReceiptStatus\)/);
  assert.match(handler, /Tankad nu kräver kvittobild eller Kvitto saknas med obligatorisk orsak/);
  assert.match(handler, /fuel_receipt_status: fuelReceiptStatus/);
  assert.match(handler, /fuel_receipt_missing_reason:/);
});

test('database contract preserves legacy rows and only accepts the two new outcomes', () => {
  assert.match(migration, /fuel_receipt_status is null/);
  assert.match(migration, /fuel_receipt_status = 'DOCUMENTED'/);
  assert.match(migration, /fuel_receipt_status = 'MISSING_WITH_REASON'/);
  assert.match(migration, /length\(trim\(coalesce\(fuel_receipt_missing_reason, ''\)\)\) > 0/);
});

test('Tower classifies evidence without monetary interpretation', () => {
  assert.match(evidenceRoute, /VERIFIED_EVIDENCE/);
  assert.match(evidenceRoute, /VERIFIED_DEVIATION/);
  assert.match(evidenceRoute, /LEGACY_UNCLASSIFIED/);
  assert.match(evidenceRoute, /monetaryInterpretation: false/);
  assert.doesNotMatch(evidenceRoute, /KISTAN/i);
});
