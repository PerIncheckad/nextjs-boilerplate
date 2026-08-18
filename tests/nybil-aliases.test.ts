import test from 'node:test';
import assert from 'node:assert/strict';

import { withNybilLegacyAliases } from '../lib/nybil-aliases';

test('Nybil compatibility shim leaves canonical data unchanged', () => {
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

  assert.equal(result, canonical);
  assert.deepEqual(result, canonical);
  assert.equal('bilmodell' in result, false);
  assert.equal('ankomstdatum' in result, false);
  assert.equal('monterade_dack' in result, false);
  assert.equal('hjul_till_forvaring' in result, false);
  assert.equal('hjul_forvaring_station' in result, false);
  assert.equal('kompressor' in result, false);
});
