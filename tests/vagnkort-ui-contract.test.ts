import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPublicAppPath } from '../lib/app-access';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const page = read('app/vagnkort/page.tsx');
const layout = read('app/layout.tsx');
const client = read('app/vagnkort/vagnkort-client.tsx');
const upload = read('app/vagnkort/document-upload.tsx');
const uploadApi = read('app/api/vehicle-documents/route.ts');
const documentApi = read('app/api/vehicle-documents/[id]/route.ts');
const periodControls = read('app/vagnkort/journey-period-controls.tsx');
const periodApi = read('app/api/vehicle-journey/periods/route.ts');
const periodMigration = read('migrations/20260820222728_atomic_vehicle_journey_period_events.sql');
const timeModelMigration = read('migrations/20260821113000_split_vehicle_state_and_activity_periods.sql');
const metricsPanel = read('app/vagnkort/journey-metrics-panel.tsx');
const metricsApi = read('app/api/vehicle-journey/metrics/route.ts');
const saluPanel = read('app/vagnkort/salu-journey-panel.tsx');
const equipmentControls = read('app/vagnkort/equipment-change-controls.tsx');
const equipmentApi = read('app/api/vehicle-journey/equipment/route.ts');
const journeyApi = read('app/api/vehicle-journey/route.ts');
const home = read('app/page.tsx');

function matches(source: string, patterns: RegExp[]) {
  for (const pattern of patterns) assert.match(source, pattern);
}

test('Vagnkort stays behind the central app auth boundary', () => {
  assert.equal(isPublicAppPath('/vagnkort'), false);
  matches(layout, [/<AppAuthBoundary>\{children\}<\/AppAuthBoundary>/]);
  matches(page, [/<VagnkortClient \/>/]);
  assert.doesNotMatch(page, /LoginGate/);
});

test('Vagnkort reads the authenticated vehicle journey API', () => {
  matches(client, [/fetch\(`\/api\/vehicle-journey\?reg=/, /Bilens digitala pärm/, /Utrustning – Nybil mot nu/, /Tid i resan/, /Dokument/, /Tidslinje/]);
});

test('Vagnkort surfaces lifecycle metrics and refreshes them with period changes', () => {
  matches(client, [/<JourneyMetricsPanel regnr=\{data\.regnr\} refreshNonce=\{refreshNonce\} \/>/]);
  matches(metricsPanel, [/\/api\/vehicle-journey\/metrics\?reg=/, /Resans nyckeltal/, /Nyttjandegrad/, /Nybil → första uthyrning/, /Sista retur → SALU/, /Stillestånd per huvudorsak/, /Aktiviteter inom stillestånd/, /Huvudperioder överlappar/]);
  matches(metricsApi, [/verifyApiUser\(request\)/, /computeJourneyLifecycleMetrics/, /vehicle_journey_activity_periods/]);
});

test('Vagnkort presents SALU as the endpoint with deviations, handling and evidence', () => {
  matches(client, [/SALU – slutdelen av bilens resa/, /<SaluJourneyPanel/, /documents=\{data\.documents\}/]);
  matches(saluPanel, [/Ursprungligt SALU-datum/, /Aktuellt SALU-datum/, /Förskjutning/, /Kontrollpunkter som kräver uppmärksamhet/, /Hantering/, /salu_checkpoint_id/, /salu_child_process_id/, /SALU-underlag/, /Öppna underlag/, /\/api\/vehicle-documents\/\$\{encodeURIComponent\(document\.document_id\)\}/, /evidenceContext/]);
});

test('Vagnkort surfaces baseline/current equipment changes', () => {
  matches(client, [/baseline\[key\] !== current\[key\]/, /Förändrat/]);
});

test('Vagnkort document upload uses authenticated signed Storage flow', () => {
  matches(client, [/<DocumentUpload/]);
  matches(upload, [/action:\s*'prepare'/, /uploadToSignedUrl/, /action:\s*'complete'/, /Släpp filer här/, /Leverantörsfaktura/, /Skadebild/]);
});

test('Vagnkort reuses already loaded journey context for document upload', () => {
  matches(client, [/damages=\{data\.damages\}/, /checkpoints=\{data\.salu\.checkpoints\}/, /childProcesses=\{data\.salu\.childProcesses\}/]);
  assert.doesNotMatch(upload, /\/api\/vehicle-journey\?reg=/);
  assert.match(upload, /Inga valbara poster/);
});

test('Vagnkort shows document context directly in the document list', () => {
  matches(client, [/documentContextLabel/, /metadata\?\.context\?\.label/, /Kopplat till:/, /SALU-checkpoint/, /SALU-åtgärd/, /Incheckning/, /Bilen generellt/]);
});

test('document upload can bind evidence to vehicle, damage and SALU context', () => {
  matches(upload, [/Bilen generellt/, /SALU-checkpoint/, /SALU-åtgärd/, /contextType/, /contextId/]);
  matches(uploadApi, [/resolveDocumentContext/, /Damage does not belong to vehicle/, /SALU checkpoint does not belong to vehicle/, /SALU action does not belong to vehicle/, /damage_id/, /salu_checkpoint_id/, /salu_child_process_id/]);
});

test('document server API stays authenticated, private and appends a journey event', () => {
  matches(uploadApi, [/verifyApiUser\(request\)/, /createSignedUploadUrl/, /vehicle_documents/, /DOCUMENT_UPLOADED/, /uploaded_by:\s*verification\.user\.id/]);
  matches(documentApi, [/verifyApiUser\(request\)/, /createSignedUrl/, /300/]);
});

test('Vagnkort treats period controls as one primary vehicle state at a time', () => {
  matches(client, [/<JourneyPeriodControls regnr=/]);
  matches(periodControls, [/Tillgänglig/, /Uthyrd/, /Stillestånd/, /Förberedelse/, /ett huvudtillstånd åt gången/, /aktiviteter inom ett stillestånd/, /action:\s*'TRANSITION'/, /action:\s*'CLOSE'/, /\/api\/vehicle-journey\/periods/]);

  const primaryBlock = periodControls.match(/const PRIMARY_PERIOD_TYPES = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
  assert.match(primaryBlock, /AVAILABLE/);
  assert.match(primaryBlock, /RENTAL/);
  assert.match(primaryBlock, /DOWNTIME/);
  assert.doesNotMatch(primaryBlock, /WORKSHOP/);
  assert.doesNotMatch(primaryBlock, /TRANSPORT/);

  const reasonBlock = periodControls.match(/const DOWNTIME_REASONS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
  assert.match(reasonBlock, /WORKSHOP/);
  assert.match(reasonBlock, /TRANSPORT/);
});

test('journey period API validates primary states and activity periods through atomic RPCs', () => {
  matches(periodApi, [/verifyApiUser\(request\)/, /vehicleExists/, /DOWNTIME_REASONS/, /Downtime requires a valid reason/, /rpc\('transition_vehicle_journey_state'/, /rpc\('close_vehicle_journey_period'/, /rpc\('start_vehicle_journey_activity_period'/, /rpc\('close_vehicle_journey_activity_period'/]);
  matches(periodMigration, [/'PERIOD_STARTED'/, /'PERIOD_ENDED'/, /insert into public\.vehicle_journey_periods/i, /insert into public\.vehicle_journey_events/i, /p_actor_id/]);
  matches(timeModelMigration, [/vehicle_journey_periods_one_open_state_uidx/, /vehicle_journey_activity_periods/, /ACTIVITY_PERIOD_STARTED/, /ACTIVITY_PERIOD_ENDED/]);
});

test('Vagnkort can document equipment changes as append-only journey events', () => {
  matches(client, [/<EquipmentChangeControls regnr=/, /Senaste dokumenterade förändringar/]);
  matches(equipmentControls, [/Dokumentera utrustningsförändring/, /Kommentar krävs/, /\/api\/vehicle-journey\/equipment/]);
  matches(equipmentApi, [/verifyApiUser\(request\)/, /EQUIPMENT_CHANGED/, /Equipment change requires a comment/, /actor_id:\s*verification\.user\.id/, /vehicle_journey_events/]);
});

test('vehicle journey read model overlays latest equipment event without overwriting Nybil baseline', () => {
  matches(journeyApi, [/equipmentBaseline/, /equipmentChanges/, /fieldsOverlaid/, /equipmentCurrent\[change\.field\] = change\.value/, /event_type === 'EQUIPMENT_CHANGED'/]);
});

test('start page links to Vagnkort', () => {
  assert.match(home, /href="\/vagnkort"/);
});
