import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const route = readFileSync('app/api/vehicle-journey/route.ts', 'utf8');
const client = readFileSync('app/vagnkort/vagnkort-client.tsx', 'utf8');
const panel = readFileSync('app/vagnkort/nybil-baseline-panel.tsx', 'utf8');

const businessFields = [
  'regnr', 'bilmarke', 'bilmarke_annat', 'modell', 'registrerad_av', 'fullstandigt_namn',
  'registreringsdatum', 'plats_mottagning_ort', 'plats_mottagning_station', 'planerad_station',
  'matarstallning_inkop', 'hjultyp', 'hjul_ej_monterade', 'hjul_forvaring_ort', 'hjul_forvaring',
  'bransletyp', 'vaxel', 'laddniva_procent', 'tankstatus', 'upptankning_liter', 'upptankning_literpris',
  'serviceintervall', 'max_km_manad', 'avgift_over_km', 'antal_insynsskydd', 'instruktionsbok',
  'instruktionsbok_forvaring_ort', 'instruktionsbok_forvaring_spec', 'coc', 'coc_forvaring_ort',
  'coc_forvaring_spec', 'antal_nycklar', 'extranyckel_forvaring_ort', 'extranyckel_forvaring_spec',
  'antal_laddkablar', 'laddkablar_forvaring_ort', 'laddkablar_forvaring_spec', 'lasbultar_med',
  'dragkrok', 'gummimattor', 'dackkompressor', 'stold_gps', 'stold_gps_spec', 'mbme_aktiverad',
  'vw_connect_aktiverad', 'plats_aktuell_ort', 'plats_aktuell_station', 'matarstallning_aktuell',
  'saludatum', 'salu_station', 'kopare_foretag', 'returort', 'returadress', 'attention',
  'notering_forsaljning', 'anteckningar', 'klar_for_uthyrning', 'klar_for_uthyrning_notering',
  'har_skador_vid_leverans', 'photo_urls', 'video_urls',
  'planning_period', 'planning_reason', 'supplier', 'order_reference', 'vin', 'source_regnr', 'saluort',
  'daily_rate', 'holding_period_months', 'ordered_at', 'calloff_at', 'confirmation_status',
  'transport_status', 'planned_delivery_date', 'planning_note',
] as const;

test('full current Nybil business write contract is present in vehicle journey baseline read', () => {
  const nybilSelect = route.match(/\.from\('nybil_inventering'\)[\s\S]*?\.select\('([^']+)'\)/)?.[1] ?? '';
  const selected = new Set(nybilSelect.split(','));
  for (const field of businessFields) {
    assert.ok(selected.has(field), `Nybil business field missing from API read: ${field}`);
  }
  assert.ok(selected.has('hjul_forvaring'), 'current Nybil wheel storage write column must be read');
});

test('Vagnkort renders the source-owned baseline separately from current state and changes', () => {
  assert.match(route, /baseline: nybil/);
  assert.match(client, /<NybilBaselinePanel baseline=\{data\.baseline\} \/>/);
  assert.match(panel, /NYBIL – REGISTRERAT VID MOTTAGNING/);
  assert.match(client, /NU – SENAST VERIFIERADE LÄGE/);
  assert.match(client, /FÖRÄNDRINGAR – SENASTE VERIFIERADE HÄNDELSER/);
});

test('baseline presentation preserves false and zero, while null remains explicitly unknown', () => {
  assert.match(panel, /value === null \|\| value === undefined \|\| value === ''/);
  assert.match(panel, /return value \? 'Ja' : 'Nej'/);
  assert.match(panel, /return String\(value\)/);
  assert.match(panel, /Saknas \/ ej registrerat/);
});

test('storage attributes are carried through the baseline display', () => {
  for (const field of [
    'hjul_forvaring_ort', 'hjul_forvaring',
    'extranyckel_forvaring_ort', 'extranyckel_forvaring_spec',
    'laddkablar_forvaring_ort', 'laddkablar_forvaring_spec',
    'instruktionsbok_forvaring_ort', 'instruktionsbok_forvaring_spec',
    'coc_forvaring_ort', 'coc_forvaring_spec',
  ]) {
    assert.match(panel, new RegExp(`key: '${field}'`), `storage display missing: ${field}`);
  }
});

test('all business fields are intentionally represented in baseline display contract', () => {
  for (const field of businessFields) {
    assert.match(panel, new RegExp(`key: '${field}'`), `Vagnkort display field missing: ${field}`);
  }
});

test('vehicle journey remains a read-only API boundary', () => {
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
