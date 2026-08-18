import test from 'node:test';
import assert from 'node:assert/strict';

import { withNybilLegacyAliases } from '../lib/nybil-aliases';

test('Nybil retained legacy aliases mirror canonical fields without changing other data', () => {
  const canonical = {
    regnr: 'ABC123',
    modell: 'T-Cross',
    registreringsdatum: '2026-08-18',
    hjultyp: 'Sommardäck',
    hjul_ej_monterade: 'Vinterdäck',
    hjul_forvaring_ort: 'Malmö',
    dackkompressor: true,
    anteckningar: 'Behålls',
  };

  const result = withNybilLegacyAliases(canonical);

  assert.deepEqual(result, {
    ...canonical,
    bilmodell: canonical.modell,
    hjul_till_forvaring: canonical.hjul_ej_monterade,
    hjul_forvaring_station: canonical.hjul_forvaring_ort,
  });

  assert.equal('bilmodell' in canonical, false);
  assert.equal('hjul_till_forvaring' in canonical, false);
});

test('canonical Nybil fields win over stale retained legacy aliases', () => {
  const result = withNybilLegacyAliases({
    modell: 'Kanonisk modell',
    registreringsdatum: '2026-08-18',
    hjultyp: null,
    hjul_ej_monterade: null,
    hjul_forvaring_ort: null,
    dackkompressor: false,
    bilmodell: 'Gammal modell',
    hjul_till_forvaring: 'Gammalt värde',
    hjul_forvaring_station: 'Gammal ort',
  });

  assert.equal(result.bilmodell, 'Kanonisk modell');
  assert.equal(result.hjul_till_forvaring, null);
  assert.equal(result.hjul_forvaring_station, null);
});
