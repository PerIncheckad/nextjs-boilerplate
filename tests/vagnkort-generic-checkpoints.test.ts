import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const readModelApi = read('app/api/vehicle-checkpoints/read-model/route.ts');
const panel = read('app/vagnkort/generic-checkpoints-panel.tsx');
const metricsPanel = read('app/vagnkort/journey-metrics-panel.tsx');

test('checkpoint read model enriches current status with definition, verified outcome and journey events', () => {
  assert.match(readModelApi, /verifyApiUser\(request\)/);
  assert.match(readModelApi, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(readModelApi, /vehicleExists/);
  assert.match(readModelApi, /from\('vehicle_checkpoints'\)/);
  assert.match(readModelApi, /from\('checkpoint_definitions'\)/);
  assert.match(readModelApi, /from\('checkpoint_assessments'\)/);
  assert.match(readModelApi, /from\('vehicle_journey_events'\)/);
  assert.match(readModelApi, /CHECKPOINT_CREATED/);
  assert.match(readModelApi, /CHECKPOINT_ASSESSED/);
  assert.match(readModelApi, /latestAssessment/);
  assert.match(readModelApi, /linkedJourneyEvent/);
  assert.match(readModelApi, /checkpointEvents/);
  assert.doesNotMatch(readModelApi, /\.(insert|update|upsert|delete)\(/);
});

test('checkpoint read model exposes blocking readiness without duplicating SALU checkpoints', () => {
  assert.match(readModelApi, /unresolvedBlocking/);
  assert.match(readModelApi, /checkpoint\.definition\?\.blocking/);
  assert.match(readModelApi, /checkpoint\.status === 'VANTAR' \|\| checkpoint\.status === 'AVVIKELSE'/);
  assert.doesNotMatch(readModelApi, /from\('salu_checkpoints'\)/);
  assert.doesNotMatch(readModelApi, /insert\(/);
});

test('Vagnkort displays generic checkpoints, verified outcomes and source events', () => {
  assert.match(metricsPanel, /GenericCheckpointsPanel/);
  assert.match(metricsPanel, /<GenericCheckpointsPanel regnr=\{regnr\} refreshNonce=\{refreshNonce\} \/>/);
  assert.match(panel, /Kontrollpunkter i fordonsresan/);
  assert.match(panel, /Blockerande/);
  assert.match(panel, /Verifierat utfall/);
  assert.match(panel, /Källhändelse/);
  assert.match(panel, /Fordonsresan:/);
  assert.match(panel, /SALU:s S00–S28 visas fortsatt separat/);
  assert.match(panel, /\/api\/vehicle-checkpoints\/read-model\?reg=/);
});

test('Vagnkort source synchronization is explicit and remains the repair path', () => {
  assert.match(panel, /Synkronisera källor/);
  assert.match(panel, /fetch\('\/api\/vehicle-checkpoints\/sync'/);
  assert.match(panel, /method:\s*'POST'/);
  assert.match(panel, /JSON\.stringify\(\{ regnr \}\)/);
  assert.doesNotMatch(readModelApi, /sync_vehicle_source_checkpoints/);
});

test('checkpoint read model stays behind the central API authentication boundary', async () => {
  const response = await proxy(new NextRequest(
    'http://localhost/api/vehicle-checkpoints/read-model?reg=GEU29F',
  ));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
});
