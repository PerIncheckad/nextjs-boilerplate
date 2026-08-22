import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'lib/status-read-model-source.ts'), 'utf8');

test('Status read-model source stays behind authenticated status-data client', () => {
  assert.match(source, /fetchStatusData/);
  assert.doesNotMatch(source, /from ['"]\.\/supabase['"]/);
  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(source, /\.rpc\(/);
});
