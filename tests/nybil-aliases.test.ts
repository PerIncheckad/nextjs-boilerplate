import test from 'node:test';
import assert from 'node:assert/strict';

import { withNybilLegacyAliases } from '../lib/nybil-aliases';

test('Nybil retains only the separate notifier compatibility field', () => {
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
    hjul_till_forvaring: canonical.hjul_ej_monterade,
  });

  assert.equal('bilmodell' in result, false);
  assert.equal('hjul_forvaring_station' in result, false);
});

test('canonical Nybil value wins over stale notifier compatibility input', () => {
  const result = withNybilLegacyAliases({
    modell: 'Kanonisk modell',
    registreringsdatum: '2026-08-18',
    hjultyp: null,
    hjul_ej_monterade: null,
    hjul_forvaring_ort: null,
    dackkompressor: false,
    hjul_till_forvaring: 'Gammalt värde',
  });

  assert.equal(result.hjul_till_forvaring, null);
  assert.equal('bilmodell' in result, false);
  assert.equal('hjul_forvaring_station' in result, false);
});
