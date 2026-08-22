import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'lib/status-data-client.ts'), 'utf8');

test('Status data client uses the authenticated same-origin API', () => {
  assert.match(source, /fetch\(`\/api\/status-data\?regnr=\$\{encodeURIComponent\(regnr\)\}`\)/);
  assert.doesNotMatch(source, /supabase\.(from|rpc)\(/);
});
