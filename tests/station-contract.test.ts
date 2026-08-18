import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_HUVUDSTATION_ADDRESS,
  getHuvudstationRecipients,
  HUVUDSTATION_EMAIL_BY_ORT,
  HUVUDSTATIONER,
  ORTER,
  STATIONER,
} from '../lib/constants';

const expectedStations = {
  Falkenberg: ['Falkenberg'],
  Halmstad: ['BVH (Hedin multi)', 'Flyget Halmstad', 'FORD Halmstad', 'KIA Halmstad', 'MB Halmstad'],
  Helsingborg: ['B/S Klippan', 'BMW Helsingborg', 'Euromaster Helsingborg', 'FORD Helsingborg', 'HBSC Helsingborg', 'KIA Helsingborg', 'MB Helsingborg', 'S. Jönsson', 'Transport Helsingborg'],
  Lund: ['B/S Lund', 'FORD Lund', 'Hedin Lund', 'P7 Revinge'],
  Malmö: ['FORD Malmö', 'Hedbergs Malmö', 'Hedin Automotive Burlöv', 'Malmö Automera', 'MB Malmö', 'Mechanum', 'Sturup', 'Werksta Malmö Hamn', 'Werksta St Bernstorp'],
  Trelleborg: ['Trelleborg'],
  Varberg: ['Autoklinik (Sällstorp)', 'Finnveden plåt', 'FORD Varberg', 'MB Varberg', 'Varberg multi (Hedin)'],
  Ängelholm: ['Flyget Ängelholm', 'FORD Ängelholm', 'Mekonomen Ängelholm'],
};

test('preserves the shared city and detailed-station choices', () => {
  assert.deepEqual(ORTER, [
    'Falkenberg',
    'Halmstad',
    'Helsingborg',
    'Lund',
    'Malmö',
    'Trelleborg',
    'Varberg',
    'Ängelholm',
  ]);
  assert.deepEqual(STATIONER, expectedStations);
  assert.equal(Object.values(STATIONER).flat().length, 37);
});

test('preserves external main-station ids', () => {
  assert.deepEqual(HUVUDSTATIONER, [
    { name: 'Falkenberg', id: 282 },
    { name: 'Halmstad', id: 274 },
    { name: 'Helsingborg', id: 170 },
    { name: 'Lund', id: 406 },
    { name: 'Malmö', id: 166 },
    { name: 'Trelleborg', id: 283 },
    { name: 'Varberg', id: 290 },
    { name: 'Ängelholm', id: 171 },
  ]);
});

test('preserves huvudstation email routing and fallback', () => {
  assert.deepEqual(HUVUDSTATION_EMAIL_BY_ORT, {
    Helsingborg: 'helsingborg@incheckad.se',
    Ängelholm: 'helsingborg@incheckad.se',
    Varberg: 'varberg@incheckad.se',
    Malmö: 'malmo@incheckad.se',
    Trelleborg: 'trelleborg@incheckad.se',
    Lund: 'lund@incheckad.se',
    Halmstad: 'halmstad@incheckad.se',
    Falkenberg: 'falkenberg@incheckad.se',
  });
  assert.deepEqual(getHuvudstationRecipients('Malmö'), [
    DEFAULT_HUVUDSTATION_ADDRESS,
    'malmo@incheckad.se',
  ]);
  assert.deepEqual(getHuvudstationRecipients('Okänd'), [
    DEFAULT_HUVUDSTATION_ADDRESS,
  ]);
});
