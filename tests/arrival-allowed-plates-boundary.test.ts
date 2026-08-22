import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'app/ankomst/form-client.tsx'), 'utf8');

test('arrival autocomplete uses authenticated allowed plates client', () => {
  assert.match(source, /fetchAllowedPlates\(\)/);
  assert.doesNotMatch(source, /supabase\.rpc\(['"]get_all_allowed_plates['"]\)/);
});
