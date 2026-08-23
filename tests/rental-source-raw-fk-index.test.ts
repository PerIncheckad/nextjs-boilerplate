import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'migrations/20260823114500_index_rental_operational_source_raw_fk.sql'),
  'utf8',
);

test('canonical RENTAL fact RAW foreign key has a covering index', () => {
  assert.match(migration, /create index if not exists rental_operational_facts_source_raw_row_idx/i);
  assert.match(migration, /on public\.rental_operational_facts \(source_raw_row_id\)/i);
  assert.doesNotMatch(migration, /alter table|drop table|drop column|update public|delete from public/i);
});
