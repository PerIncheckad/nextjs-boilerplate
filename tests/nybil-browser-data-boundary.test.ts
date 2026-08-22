import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'app/nybil/form-client.tsx'), 'utf8');

test('Nybil browser keeps storage but routes app data through authenticated APIs', () => {
  assert.match(source, /checkNybilDuplicate/);
  assert.match(source, /createNybilRegistration/);
  assert.match(source, /createNybilDamage/);
  assert.match(source, /supabase\.storage\.from/);
  assert.doesNotMatch(source, /\bsupabase\s*\.from\s*\(/);
  assert.doesNotMatch(source, /\bsupabase\s*\.rpc\s*\(/);
});
