import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'lib/vehicle-status.ts'), 'utf8');

test('Status consumer stays behind authenticated read-model source', () => {
  assert.match(source, /fetchStatusReadModelSourceData/);
  assert.doesNotMatch(source, /from ['"]\.\/supabase['"]/);
  assert.doesNotMatch(source, /\bsupabase\s*\.(?:from|rpc)\s*\(/);
  assert.doesNotMatch(source, /\/api\/checkin-damages/);
});
