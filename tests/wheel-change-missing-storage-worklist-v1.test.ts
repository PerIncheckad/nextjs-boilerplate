import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync('app/garage/garage-wheel-change-panel.tsx', 'utf8');
const docs = readFileSync('docs/HJULSKIFTE_OPERATIVT_KONTRAKT_2026-09-01.md', 'utf8');

test('Hjulskifte separates missing wheel storage from startable work', () => {
  assert.match(panel, /const missingStorageCandidates = useMemo/);
  assert.match(panel, /!storageByRegnr\[item\.regnr\]\?\.wheel_storage_location/);
  assert.match(panel, /const actionableCandidates = useMemo/);
  assert.match(panel, /Boolean\(storageByRegnr\[item\.regnr\]\?\.wheel_storage_location\)/);
  assert.match(panel, /aria-label="Bilar som saknar hjulförvaring"/);
  assert.match(panel, /aria-label="Bilar redo för hjulskifte"/);
});

test('missing storage worklist opens the exact vehicle in Status', () => {
  assert.match(panel, /href={`\/status\?reg=\$\{encodeURIComponent\(item\.regnr\)\}`}/);
  assert.match(panel, />Ange förvaring<\/a>/);
  assert.match(panel, /Ange registrerad förvaring i Status\./);
});

test('missing storage remains an explicit fact gap instead of station inference', () => {
  assert.doesNotMatch(panel, /WHEEL_STATION_BY_CITY/);
  assert.match(docs, /Ingen station, ort eller annan fordonsposition får användas som fallback\./);
  assert.match(docs, /Saknas den ska systemet visa ett arbete att utföra – inte hitta på en plats\./);
});

test('Hjulskifte operational contract documents source priority and Production acceptance', () => {
  assert.match(docs, /Senaste manuella ändring i `vehicle_edits`/);
  assert.match(docs, /Registrerad förvaring i `nybil_inventering`/);
  assert.match(docs, /Legacy fallback i `vehicles\.wheel_storage_location`/);
  assert.match(docs, /Production-acceptans/);
  assert.match(docs, /#520 – separat operativ worklist för saknad hjulförvaring/);
});
