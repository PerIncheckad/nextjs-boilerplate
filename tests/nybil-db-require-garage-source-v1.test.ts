import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/20260903023000_nybil_require_exact_garage_source_v1.sql', 'utf8');

test('database rejects every future Nybil insert without exact Garage source', () => {
  assert.match(migration, /if new\.source_garage_item_id is null then/);
  assert.match(migration, /Ny bil måste ha exakt Garage-källa/);
  assert.match(migration, /if new\.source_garage_updated_at is null then/);
  assert.match(migration, /v_item\.voided_at is not null/);
  assert.match(migration, /v_item\.garage_direction <> 'IN'/);
  assert.match(migration, /Garage\/Nybil regnr mismatch/);
  assert.match(migration, /v_item\.handed_off_nybil_id is not null/);
  assert.match(migration, /v_item\.updated_at is distinct from new\.source_garage_updated_at/);
  assert.match(migration, /before insert on public\.nybil_inventering/);
  assert.match(migration, /for each row\s*execute function public\.guard_nybil_garage_source_version\(\)/);
  assert.doesNotMatch(migration, /when \(new\.source_garage_item_id is not null\)/);
});
