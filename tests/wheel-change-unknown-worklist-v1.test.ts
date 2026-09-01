import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync('app/garage/garage-wheel-change-panel.tsx', 'utf8');
const migration = readFileSync('migrations/20260901021000_wheel_change_hjultyp_edit_precedence.sql', 'utf8');

test('Garage identifies every vehicle that needs wheel status verification', () => {
  assert.match(panel, /unknownCandidates\.map/);
  assert.match(panel, /Bilar med okänd hjulstatus/);
  assert.match(panel, /item\.regnr/);
  assert.match(panel, /item\.latest_checkin_at/);
  assert.match(panel, /item\.current_city/);
  assert.match(panel, /item\.current_station/);
  assert.match(panel, /Verifiera hjultyp innan Hjulskifte kan avgöras/);
});

test('unknown wheel status links to exact vehicle in Status', () => {
  assert.match(panel, /href=\{`\/status\?reg=\$\{encodeURIComponent\(item\.regnr\)\}`\}/);
  assert.match(panel, />Verifiera hjultyp<\/a>/);
});

test('unknown wheel status remains separate from actionable wheel-change candidates', () => {
  assert.match(panel, /item\.eligibility === 'REQUIRES_CHANGE'/);
  assert.match(panel, /item\.eligibility === 'UNKNOWN_WHEEL_STATUS'/);
  assert.match(panel, /actionableCandidates\.map/);
  assert.match(panel, /unknownCandidates\.map/);
});

test('wheel-change candidate source uses manual hjultyp edit before latest completed Check-in', () => {
  assert.match(migration, /e\.field_name = 'hjultyp'/);
  assert.match(migration, /order by upper\(regexp_replace\(e\.regnr/);
  assert.match(migration, /e\.edited_at desc/);
  assert.match(migration, /coalesce\(e\.edited_wheel_type, l\.checkin_wheel_type\) as current_wheel_type/);
});
