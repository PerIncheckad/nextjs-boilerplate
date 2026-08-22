import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'app/api/allowed-plates/route.ts'), 'utf8');

test('sold inventory cannot be cleared by a false vehicle edit', () => {
  assert.doesNotMatch(source, /soldSet\.delete\(/);
});
