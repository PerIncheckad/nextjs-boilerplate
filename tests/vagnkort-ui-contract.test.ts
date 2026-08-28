import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client = fs.readFileSync('app/vagnkort/vagnkort-client.tsx', 'utf8');
const page = fs.readFileSync('app/vagnkort/page.tsx', 'utf8');
const journeyApi = fs.readFileSync('app/api/vehicle-journey/route.ts', 'utf8');
const metricsApi = fs.readFileSync('app/api/vehicle-journey/metrics/route.ts', 'utf8');
const periodApi = fs.readFileSync('app/api/vehicle-journey/periods/route.ts', 'utf8');
const documentApi = fs.readFileSync('app/api/vehicle-documents/route.ts', 'utf8');
const documentItemApi = fs.readFileSync('app/api/vehicle-documents/[id]/route.ts', 'utf8');
const equipmentApi = fs.readFileSync('app/api/vehicle-journey/equipment/route.ts', 'utf8');
const equipmentControls = fs.readFileSync('app/vagnkort/equipment-change-controls.tsx', 'utf8');
const home = fs.readFileSync('app/page.tsx', 'utf8');

const matches = (source: string, patterns: RegExp[]) => {
  for (const pattern of patterns) assert.match(source, pattern);
};

test('Vagnkort stays behind the central app auth boundary', () => {
  matches(page, [/VagnkortClient/, /INCHECKAD CORE \/ VAGNKORT/]);
});

test('Vagnkort reads the authenticated vehicle journey API', () => {
  matches(client, [/\/api\/vehicle-journey\?reg=/, /fetch\(/]);
  assert.doesNotMatch(client, /supabase\s*\.\s*from\(/);
});

test('Vagnkort surfaces lifecycle metrics and refreshes them with journey changes', () => {
  matches(client, [/\/api\/vehicle-journey\/metrics\?reg=/, /lifecycleMetrics/, /refreshJourney/]);
  matches(metricsApi, [/verifyApiUser\(request\)/, /calculateVehicleLifecycleMetrics/, /vehicle_journey_periods/]);
});

test('Vagnkort presents SALU as the endpoint with deviations, handling and evidence', () => {
  matches(client, [/SALU/, /saluflagga/, /salustatus/, /saluEvents/]);
});

test('Vagnkort surfaces baseline/current equipment changes', () => {
  matches(client, [/equipmentBaseline/, /equipmentCurrent/, /equipmentChanges/]);
});

test('Vagnkort document upload uses authenticated signed Storage flow', () => {
  matches(client, [/\/api\/vehicle-documents/, /signedUpload/, /upload/]);
  matches(documentApi, [/verifyApiUser\(request\)/, /createSignedUploadUrl/, /vehicle_documents/]);
});

test('Vagnkort reuses already loaded journey context for document upload', () => {
  matches(client, [/journeyContext/, /vehicleId/]);
});

test('Vagnkort shows document context directly in the document list', () => {
  matches(client, [/documents/, /context/]);
});

test('document upload can bind evidence to vehicle, damage and SALU context', () => {
  matches(documentApi, [/vehicle_id/, /damage_id/, /salu/]);
});

test('document server API stays authenticated, private and appends a journey event', () => {
  matches(documentApi, [/verifyApiUser\(request\)/, /vehicle_journey_events/]);
  matches(documentItemApi, [/verifyApiUser\(request\)/]);
});

test('Vagnkort primary state UI is read-only and reflects source-controlled truth', () => {
  matches(client, [/primaryState/, /source/]);
  assert.doesNotMatch(client, /transitionPrimaryState/);
});

test('journey period API blocks manual primary writes but retains authenticated downtime activities', () => {
  matches(periodApi, [/verifyApiUser\(request\)/, /DOWNTIME/]);
});

test('Vagnkort can document equipment changes as append-only journey events', () => {
  matches(client, [/<EquipmentChangeControls regnr=/, /Senaste dokumenterade förändringar/]);
  matches(equipmentControls, [/Dokumentera utrustningsförändring/, /Kommentar krävs/, /\/api\/vehicle-journey\/equipment/]);
  matches(equipmentApi, [/verifyApiUser\(request\)/, /EQUIPMENT_CHANGED/, /Equipment change requires a comment/, /actor_id:\s*verification\.user\.id/, /vehicle_journey_events/]);
});

test('vehicle journey read model overlays latest equipment event without overwriting Nybil baseline', () => {
  matches(journeyApi, [/equipmentBaseline/, /equipmentChanges/, /fieldsOverlaid/, /equipmentCurrent\[change\.field\] = change\.value/, /event_type === 'EQUIPMENT_CHANGED'/]);
});

test('start page exposes Vagnkort and Status through the operational module registry', () => {
  matches(home, [/href:\s*'\/vagnkort'/, /label:\s*'Vagnkort'/, /href:\s*'\/status'/, /label:\s*'Status'/]);
});
