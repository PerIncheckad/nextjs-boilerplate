import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isActionableWheelStorage } from '../lib/wheel-storage-actionability';

const api = readFileSync('app/api/garage/wheel-changes/route.ts', 'utf8');
const canonicalMigration = readFileSync('migrations/20260914193000_hjulskifte_canonical_fleet_consumer.sql', 'utf8');
const panel = readFileSync('app/hjulskifte/hjulskifte-panel.tsx', 'utf8');
const page = readFileSync('app/hjulskifte/page.tsx', 'utf8');
const shell = readFileSync('components/CoreProductShell.tsx', 'utf8');
const productNavigationContract = readFileSync('components/product-navigation-contract.ts', 'utf8');
const css = readFileSync('app/hjulskifte/hjulskifte.module.css', 'utf8');

test('D1 consumes canonical fleet candidates without a parallel terminal-UT membership gate', () => {
  assert.match(api, /readCandidateSource/);
  assert.match(api, /get_wheel_change_candidate_source/);
  assert.match(canonicalMigration, /fleet_membership_current_by_identity/);
  assert.match(canonicalMigration, /membership_state = 'ACTIVE'/);
  assert.match(canonicalMigration, /resolution_reason = 'RESOLVED'/);
  assert.match(canonicalMigration, /identity_scope = 'OWN_FLEET'/);
  assert.doesNotMatch(api, /garage_avveckla_events/);
  assert.doesNotMatch(api, /UT_OVERLAMNING_VERIFIERAD/);
  assert.doesNotMatch(api, /terminalUtRegnrs/);
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
  assert.match(shell, /SUPPORTING_NAVIGATION_ITEMS\.map/);
  assert.match(productNavigationContract, /\{\s*href:\s*'\/hjulskifte',\s*label:\s*'HJULSKIFTE',\s*key:\s*'hjulskifte'\s*\}/);
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
