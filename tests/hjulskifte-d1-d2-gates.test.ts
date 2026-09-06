import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isActionableWheelStorage } from '../lib/wheel-storage-actionability';

const api = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const panel = readFileSync('app/hjulskifte/hjulskifte-panel.tsx', 'utf8');
const page = readFileSync('app/hjulskifte/page.tsx', 'utf8');
const shell = readFileSync('components/CoreProductShell.tsx', 'utf8');
const css = readFileSync('app/hjulskifte/hjulskifte.module.css', 'utf8');

test('D1 excludes only verified terminal UT from candidate and create gates', () => {
  assert.match(api, /garage_avveckla_events/);
  assert.match(api, /UT_OVERLAMNING_VERIFIERAD/);
  assert.match(api, /!terminalUtRegnrs\.has\(candidateRegnr\)/);
  assert.match(api, /terminalUtRegnrs\.has\(regnr\)/);
  assert.match(api, /verifierat lämnat verksamheten/);
});

test('D2 rejects explicit missing or unclear storage for booking', () => {
  for (const value of [null, '', '?', 'FINNS EJ', 'FINNS INTE', 'INGA HJUL', 'SAKNAS', 'OKLAR', 'OKLART', 'OKÄND', 'OKÄNT', 'SÅLD']) {
    assert.equal(isActionableWheelStorage(value), false, String(value));
  }
  for (const value of ['MALMÖ R9', 'HEDBERGS', 'Mechanum', 'Ford källare']) {
    assert.equal(isActionableWheelStorage(value), true, value);
  }
  assert.match(api, /readRegisteredWheelStorage/);
  assert.match(api, /requestedStatus === 'BOKAD' && !isActionableWheelStorage\(registeredStorage\)/);
  assert.match(api, /p_location: requestedStatus === 'BOKAD' \? registeredStorage : location/);
  assert.match(api, /status === 'BOKAD'/);
  assert.match(api, /effectiveLocation = registeredStorage/);
});

test('D2 keeps explicit verified Klar available when storage is missing or unclear', () => {
  assert.match(panel, /missingStorageCandidates\.map/);
  assert.match(panel, /createShortcut\(item, 'KLAR'\)/);
  assert.match(panel, /Redan utfört \/ Klar/);
  assert.doesNotMatch(api, /requestedStatus === 'KLAR' && !isActionableWheelStorage/);
  assert.doesNotMatch(api, /status === 'KLAR' && !isActionableWheelStorage/);
});

test('D2 preserves raw storage text and routes correction to Status', () => {
  assert.match(panel, /const rawStorage = storageByRegnr\[item\.regnr\]\?\.wheel_storage_location \?\? null/);
  assert.match(panel, /rawStorage \?\? 'Saknas'/);
  assert.match(panel, /\/status\?reg=/);
});

test('uppercase presentation changes labels only, not technical status values', () => {
  assert.match(page, /title="HJULSKIFTE"/);
  assert.match(shell, /'\/hjulskifte', 'HJULSKIFTE'/);
  assert.match(css, /text-transform:uppercase/);
  assert.match(api, /const STATUSES = \['KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE'\]/);
});

test('locked wheel eligibility and current-wheel contracts are untouched', () => {
  assert.match(api, /classifyWheelEligibility/);
  assert.match(api, /eligibility !== 'REQUIRES_CHANGE'/);
  assert.match(panel, /BEHÖVER|Behöver skifte/);
  assert.match(panel, /BOKAD/);
  assert.match(panel, /KLAR/);
});
