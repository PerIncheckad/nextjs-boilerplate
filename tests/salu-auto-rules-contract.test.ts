import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260820_seed_salu_auto_rules_v1.sql'),
  'utf8',
);

const route = readFileSync(
  join(process.cwd(), 'app/api/salu/plan/route.ts'),
  'utf8',
);

test('SALU AUTO baseline contains the locked make defaults', () => {
  assert.match(migration, /'Mercedes-Benz', '\{\}', 6/);
  assert.match(migration, /'BMW', '\{\}', 6/);
  assert.match(migration, /'VW', '\{\}', 12/);
  assert.match(migration, /'KIA', '\{\}', 12/);
  assert.match(migration, /'FORD', '\{\}', 12/);
});

test('SALU AUTO baseline contains the locked 24-month model exceptions', () => {
  for (const model of ['Sprinter', 'Citan', 'Vito', 'V', 'Transit', 'Connect', 'Tourneo']) {
    assert.match(migration, new RegExp(`'\\{${model}\\}', 24`));
  }
});

test('AUTO seed is versioned, idempotent and does not update existing versions', () => {
  assert.match(migration, /rule_version/);
  assert.match(migration, /on conflict \(rule_id, rule_version\) do nothing/i);
  assert.doesNotMatch(migration, /do update/i);
  assert.doesNotMatch(migration, /salu_vehicle_state|nybil_inventering/i);
});

test('AUTO endpoint only loads active rules that are already valid', () => {
  assert.match(route, /\.eq\('active', true\)/);
  assert.match(route, /\.lte\('valid_from', currentUtcDate\(\)\)/);
});
