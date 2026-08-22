import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const nybilRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/nybil/route.ts'), 'utf8');
const damageRoute = fs.readFileSync(path.join(process.cwd(), 'app/api/nybil/damages/route.ts'), 'utf8');

for (const [name, source] of [['nybil', nybilRoute], ['nybil damages', damageRoute]] as const) {
  test(`${name} API stays authenticated and server-side`, () => {
    assert.match(source, /verifyApiUser\(request\)/);
    assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(source, /createClient/);
  });
}
