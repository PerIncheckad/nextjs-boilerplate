import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addCalendarMonths,
  calculateAutoSaludatum,
  lifecycleDay,
  saluEscalationStatus,
  saluFlagDate,
  selectSaluAutoRule,
  stillestandSaluDays,
  type SaluAutoRule,
} from '../lib/salu-core';

const rules: SaluAutoRule[] = [
  { id: 'mb-default', version: 1, make: 'Mercedes-Benz', months: 6 },
  { id: 'mb-sprinter', version: 1, make: 'Mercedes-Benz', modelTokens: ['Sprinter'], months: 24, priority: 10 },
  { id: 'mb-citan', version: 1, make: 'Mercedes-Benz', modelTokens: ['Citan'], months: 24, priority: 10 },
  { id: 'mb-vito', version: 1, make: 'Mercedes-Benz', modelTokens: ['Vito'], months: 24, priority: 10 },
  { id: 'mb-v', version: 1, make: 'Mercedes-Benz', modelTokens: ['V'], months: 24, priority: 10 },
  { id: 'bmw-default', version: 1, make: 'BMW', months: 6 },
  { id: 'vw-default', version: 1, make: 'VW', months: 12 },
  { id: 'kia-default', version: 1, make: 'KIA', months: 12 },
  { id: 'ford-default', version: 1, make: 'FORD', months: 12 },
  { id: 'ford-transit', version: 1, make: 'FORD', modelTokens: ['Transit'], months: 24, priority: 10 },
  { id: 'ford-connect', version: 1, make: 'FORD', modelTokens: ['Connect'], months: 24, priority: 10 },
  { id: 'ford-tourneo', version: 1, make: 'FORD', modelTokens: ['Tourneo'], months: 24, priority: 10 },
];

test('calendar month rule preserves day when valid and clamps month-end otherwise', () => {
  assert.equal(addCalendarMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addCalendarMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addCalendarMonths('2026-01-31', 2), '2026-03-31');
  assert.equal(addCalendarMonths('2026-07-15', 2), '2026-09-15');
});

test('repeated extensions are calculated from the then-current saludatum', () => {
  const first = addCalendarMonths('2026-07-15', 2);
  const second = addCalendarMonths(first, 1);

  assert.equal(first, '2026-09-15');
  assert.equal(second, '2026-10-15');
});

test('lifecycle is inclusive from NY = day 1', () => {
  assert.equal(lifecycleDay('2026-01-01', '2026-01-01'), 1);
  assert.equal(lifecycleDay('2026-01-01', '2027-01-01'), 366);
});

test('Stillestånd SALU is elapsed calendar days from final assessment to close', () => {
  assert.equal(stillestandSaluDays('2026-01-01', '2026-01-19'), 18);
});

test('AUTO uses model exception before make default', () => {
  const match = calculateAutoSaludatum({
    nyDate: '2026-01-15',
    make: 'Mercedes-Benz',
    model: 'Sprinter 316 CDI',
    rules,
  });

  assert.deepEqual(match, {
    ruleId: 'mb-sprinter',
    ruleVersion: 1,
    matchedMake: 'Mercedes-Benz',
    matchedModelTokens: ['Sprinter'],
    monthsApplied: 24,
    saludatum: '2028-01-15',
  });
});

test('AUTO model matching is token-safe, including Mercedes V', () => {
  assert.equal(selectSaluAutoRule('Mercedes-Benz', 'V 300 d', rules)?.id, 'mb-v');
  assert.equal(selectSaluAutoRule('Mercedes-Benz', 'Vito 119 CDI', rules)?.id, 'mb-vito');
  assert.equal(selectSaluAutoRule('Mercedes-Benz', 'EQA 250 Advanced', rules)?.id, 'mb-default');
});

test('AUTO normalization ignores case, whitespace, hyphens and punctuation', () => {
  assert.equal(selectSaluAutoRule('ford', '  Transit-Custom  ', rules)?.id, 'ford-transit');
  assert.equal(selectSaluAutoRule('MERCEDES BENZ', 'SPRINTER-316 CDI', rules)?.id, 'mb-sprinter');
});

test('AUTO never guesses when the make has no rule', () => {
  assert.equal(calculateAutoSaludatum({ nyDate: '2026-01-15', make: 'Volvo', model: 'XC40', rules }), null);
});

test('most specific matching AUTO rule wins before priority', () => {
  const localRules: SaluAutoRule[] = [
    { id: 'ford-default', version: 1, make: 'Ford', months: 12, priority: 100 },
    { id: 'transit', version: 1, make: 'Ford', modelTokens: ['Transit'], months: 24 },
    { id: 'transit-custom', version: 1, make: 'Ford', modelTokens: ['Transit', 'Custom'], months: 30 },
  ];

  assert.equal(selectSaluAutoRule('Ford', 'Transit Custom', localRules)?.id, 'transit-custom');
});

test('T-30 flag date is exactly 30 calendar days before saludatum', () => {
  assert.equal(saluFlagDate('2027-01-31'), '2027-01-01');
  assert.equal(saluFlagDate('2026-03-01'), '2026-01-30');
});

test('escalation is a current snapshot and can move back after a new plan', () => {
  assert.equal(saluEscalationStatus('2026-08-20', '2026-08-19'), 'PASSERAD');
  assert.equal(saluEscalationStatus('2026-08-20', '2026-08-20'), 'PASSERAD');
  assert.equal(saluEscalationStatus('2026-08-20', '2026-08-30'), 'T10');
  assert.equal(saluEscalationStatus('2026-08-20', '2026-10-19'), 'NORMAL');
});
