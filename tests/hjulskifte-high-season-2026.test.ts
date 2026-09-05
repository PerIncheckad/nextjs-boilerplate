import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'migrations/20260905193000_hjulskifte_high_season_2026_nybil_fallback.sql',
  'utf8',
);
const panel = readFileSync('app/garage/garage-wheel-change-panel.tsx', 'utf8');

test('candidate wheel truth precedence is STATUS then CHECK-IN then NYBIL', () => {
  assert.match(migration, /latest_hjultyp_edit/i);
  assert.match(migration, /latest_checkin/i);
  assert.match(migration, /latest_nybil/i);
  assert.match(
    migration,
    /coalesce\(e\.edited_wheel_type, c\.checkin_wheel_type, n\.nybil_wheel_type\) as current_wheel_type/i,
  );
});

test('Nybil baseline expands candidate universe without fabricating a Check-in', () => {
  assert.match(migration, /select regnr from latest_checkin\s+union\s+select regnr from latest_nybil/i);
  assert.match(migration, /c\.verified_at as latest_checkin_at/i);
  assert.doesNotMatch(migration, /coalesce\(c\.verified_at,\s*n\./i);
});

test('Nybil wheel source remains verified source data, not inferred station truth', () => {
  assert.match(migration, /nullif\(trim\(n\.hjultyp\), ''\) as nybil_wheel_type/i);
  assert.doesNotMatch(migration, /wheel_storage_location/i);
  assert.doesNotMatch(migration, /planerad_station/i);
});

test('Garage labels pre-Check-in candidates truthfully', () => {
  assert.match(panel, /latest_checkin_at: string \| null/);
  assert.match(panel, /Nybil-baseline · före första Check-in/);
  assert.match(panel, /Senaste hjulverifiering/);
});
