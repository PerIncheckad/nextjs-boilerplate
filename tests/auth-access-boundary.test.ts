import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('current-user access endpoint stays behind central API authentication', async () => {
  const response = await proxy(new NextRequest('http://localhost/api/auth/me'));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
});

test('LoginGate delegates authorization to the server access endpoint', () => {
  const source = read('components/LoginGate.tsx');

  assert.match(source, /fetch\('\/api\/auth\/me'\)/);
  assert.doesNotMatch(source, /\.from\(['"]employees['"]\)/);
  assert.doesNotMatch(source, /isWhitelistedEmail/);
});

test('current-user endpoint uses the canonical server authorization check', () => {
  const source = read('app/api/auth/me/route.ts');

  assert.match(source, /verifyApiUser\(request\)/);
  assert.match(source, /authorized:\s*true/);
});
