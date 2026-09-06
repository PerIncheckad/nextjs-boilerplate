import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const wrapper = readFileSync(join(process.cwd(), 'lib/vehicle-status-current.ts'), 'utf8');
const locationResolver = readFileSync(join(process.cwd(), 'lib/status-current-location.ts'), 'utf8');
const source = readFileSync(join(process.cwd(), 'lib/status-read-model-source.ts'), 'utf8');
const tsconfig = readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf8');
const legacyHandler = readFileSync(join(process.cwd(), 'app/api/vehicle-edits/legacy-handler.ts'), 'utf8');

test('Status current vehicle image consumes canonical wheel fact without changing source history', () => {
  assert.match(wrapper, /getLegacyVehicleStatus\(regnr\)/);
  assert.match(wrapper, /sourceData\.currentWheelFact\?\.wheel_type/);
  assert.match(wrapper, /vehicle\.hjultyp = currentWheelType/);
  assert.match(wrapper, /return \{ \.\.\.result, vehicle \}/);
  assert.doesNotMatch(wrapper, /history\s*=/);
});

test('Status current vehicle image consumes SALU-owned current Saludatum', () => {
  assert.match(wrapper, /sourceData\.saluState\?\.current_saludatum/);
  assert.match(wrapper, /vehicle\.saludatum = dateOnly\(currentSaludatum\)/);
});

test('Status current location resolves through the canonical location overlay and preserves legacy current_ort as read fallback only', () => {
  assert.match(wrapper, /resolveCurrentLocation\(sourceData\)/);
  assert.match(wrapper, /currentLocation\.city/);
  assert.match(wrapper, /currentLocation\.station/);
  assert.match(locationResolver, /checkin\.current_city/);
  assert.match(locationResolver, /checkin\.current_ort/);
  assert.match(locationResolver, /asText\(checkin\.status\) !== 'COMPLETED'/);
  assert.doesNotMatch(legacyHandler, /select\('current_city, current_ort, current_station'\)/);
  assert.match(legacyHandler, /select\('current_city, current_station'\)/);
});

test('current-fact source cache is refreshed by the existing authenticated Status read boundary', () => {
  assert.match(source, /latestByRegnr\.set\(normalizeRegnr\(regnr\), data\)/);
  assert.match(source, /getLatestStatusReadModelSourceData/);
  assert.match(source, /fetchStatusData\(regnr\)/);
});

test('only the Status alias is routed through the current-fact overlay', () => {
  const parsed = JSON.parse(tsconfig) as { compilerOptions: { paths: Record<string, string[]> } };
  assert.deepEqual(parsed.compilerOptions.paths['@/lib/vehicle-status'], ['./lib/vehicle-status-current']);
  assert.deepEqual(parsed.compilerOptions.paths['@/*'], ['./*']);
});
