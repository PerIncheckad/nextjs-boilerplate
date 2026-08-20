import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/vagnkort/page.tsx'), 'utf8');
const client = readFileSync(join(process.cwd(), 'app/vagnkort/vagnkort-client.tsx'), 'utf8');
const upload = readFileSync(join(process.cwd(), 'app/vagnkort/document-upload.tsx'), 'utf8');
const uploadApi = readFileSync(join(process.cwd(), 'app/api/vehicle-documents/route.ts'), 'utf8');
const documentApi = readFileSync(join(process.cwd(), 'app/api/vehicle-documents/[id]/route.ts'), 'utf8');
const periodControls = readFileSync(join(process.cwd(), 'app/vagnkort/journey-period-controls.tsx'), 'utf8');
const periodApi = readFileSync(join(process.cwd(), 'app/api/vehicle-journey/periods/route.ts'), 'utf8');
const metricsPanel = readFileSync(join(process.cwd(), 'app/vagnkort/journey-metrics-panel.tsx'), 'utf8');
const metricsApi = readFileSync(join(process.cwd(), 'app/api/vehicle-journey/metrics/route.ts'), 'utf8');
const equipmentControls = readFileSync(join(process.cwd(), 'app/vagnkort/equipment-change-controls.tsx'), 'utf8');
const equipmentApi = readFileSync(join(process.cwd(), 'app/api/vehicle-journey/equipment/route.ts'), 'utf8');
const journeyApi = readFileSync(join(process.cwd(), 'app/api/vehicle-journey/route.ts'), 'utf8');
const home = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

test('Vagnkort page stays behind the existing LoginGate', () => {
  assert.match(page, /<LoginGate>/);
  assert.match(page, /<VagnkortClient \/>/);
});

test('Vagnkort reads the authenticated vehicle journey API', () => {
  assert.match(client, /fetch\(`\/api\/vehicle-journey\?reg=/);
  assert.match(client, /Bilens digitala pärm/);
  assert.match(client, /Utrustning – Nybil mot nu/);
  assert.match(client, /Tid i resan/);
  assert.match(client, /Dokument/);
  assert.match(client, /Tidslinje/);
});

test('Vagnkort surfaces lifecycle metrics and refreshes them with period changes', () => {
  assert.match(client, /<JourneyMetricsPanel regnr=\{data\.regnr\} refreshNonce=\{refreshNonce\} \/>/);
  assert.match(metricsPanel, /\/api\/vehicle-journey\/metrics\?reg=/);
  assert.match(metricsPanel, /Resans nyckeltal/);
  assert.match(metricsPanel, /Nyttjandegrad/);
  assert.match(metricsPanel, /Nybil → första uthyrning/);
  assert.match(metricsPanel, /Sista retur → SALU/);
  assert.match(metricsPanel, /Stillestånd per orsak/);
  assert.match(metricsPanel, /Operativa perioder överlappar/);
  assert.match(metricsApi, /verifyApiUser\(request\)/);
  assert.match(metricsApi, /computeJourneyLifecycleMetrics/);
});

test('Vagnkort surfaces baseline/current equipment changes', () => {
  assert.match(client, /baseline\[key\] !== current\[key\]/);
  assert.match(client, /Förändrat/);
});

test('Vagnkort document upload uses authenticated prepare/complete and signed Storage upload', () => {
  assert.match(client, /<DocumentUpload regnr=/);
  assert.match(upload, /action:\s*'prepare'/);
  assert.match(upload, /uploadToSignedUrl/);
  assert.match(upload, /action:\s*'complete'/);
  assert.match(upload, /Släpp filer här/);
  assert.match(upload, /Leverantörsfaktura/);
  assert.match(upload, /Skadebild/);
});

test('Vagnkort document upload can bind evidence to vehicle, damage and SALU context', () => {
  assert.match(upload, /Bilen generellt/);
  assert.match(upload, /SALU-checkpoint/);
  assert.match(upload, /SALU-åtgärd/);
  assert.match(upload, /contextType/);
  assert.match(upload, /contextId/);
  assert.match(uploadApi, /resolveDocumentContext/);
  assert.match(uploadApi, /Damage does not belong to vehicle/);
  assert.match(uploadApi, /SALU checkpoint does not belong to vehicle/);
  assert.match(uploadApi, /SALU action does not belong to vehicle/);
  assert.match(uploadApi, /damage_id/);
  assert.match(uploadApi, /salu_checkpoint_id/);
  assert.match(uploadApi, /salu_child_process_id/);
});

test('document server API verifies identity, keeps private storage server controlled and appends a journey event', () => {
  assert.match(uploadApi, /verifyApiUser\(request\)/);
  assert.match(uploadApi, /createSignedUploadUrl/);
  assert.match(uploadApi, /vehicle_documents/);
  assert.match(uploadApi, /DOCUMENT_UPLOADED/);
  assert.match(uploadApi, /uploaded_by:\s*verification\.user\.id/);
  assert.match(documentApi, /verifyApiUser\(request\)/);
  assert.match(documentApi, /createSignedUrl/);
  assert.match(documentApi, /300/);
});

test('Vagnkort can start and close vehicle journey periods', () => {
  assert.match(client, /<JourneyPeriodControls regnr=/);
  assert.match(periodControls, /Tillgänglig/);
  assert.match(periodControls, /Uthyrd/);
  assert.match(periodControls, /Stillestånd/);
  assert.match(periodControls, /Verkstad/);
  assert.match(periodControls, /Väntar reservdelar/);
  assert.match(periodControls, /action:\s*'START'/);
  assert.match(periodControls, /action:\s*'CLOSE'/);
  assert.match(periodControls, /\/api\/vehicle-journey\/periods/);
});

test('journey period API validates vehicle, downtime reason and appends timeline events', () => {
  assert.match(periodApi, /verifyApiUser\(request\)/);
  assert.match(periodApi, /vehicleExists/);
  assert.match(periodApi, /DOWNTIME_REASONS/);
  assert.match(periodApi, /Downtime requires a valid reason/);
  assert.match(periodApi, /PERIOD_STARTED/);
  assert.match(periodApi, /PERIOD_ENDED/);
  assert.match(periodApi, /vehicle_journey_periods/);
  assert.match(periodApi, /vehicle_journey_events/);
  assert.match(periodApi, /created_by:\s*verification\.user\.id/);
});

test('Vagnkort can document equipment changes as append-only journey events', () => {
  assert.match(client, /<EquipmentChangeControls regnr=/);
  assert.match(client, /Senaste dokumenterade förändringar/);
  assert.match(equipmentControls, /Dokumentera utrustningsförändring/);
  assert.match(equipmentControls, /Kommentar krävs/);
  assert.match(equipmentControls, /\/api\/vehicle-journey\/equipment/);
  assert.match(equipmentApi, /verifyApiUser\(request\)/);
  assert.match(equipmentApi, /EQUIPMENT_CHANGED/);
  assert.match(equipmentApi, /Equipment change requires a comment/);
  assert.match(equipmentApi, /actor_id:\s*verification\.user\.id/);
  assert.match(equipmentApi, /vehicle_journey_events/);
});

test('vehicle journey read model overlays latest equipment event without overwriting Nybil baseline', () => {
  assert.match(journeyApi, /equipmentBaseline/);
  assert.match(journeyApi, /equipmentChanges/);
  assert.match(journeyApi, /fieldsOverlaid/);
  assert.match(journeyApi, /equipmentCurrent\[change\.field\] = change\.value/);
  assert.match(journeyApi, /event_type === 'EQUIPMENT_CHANGED'/);
});

test('start page links to Vagnkort', () => {
  assert.match(home, /href="\/vagnkort"/);
});
