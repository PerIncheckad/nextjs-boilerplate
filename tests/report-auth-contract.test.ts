import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

import { proxy } from '../proxy';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const page = read('app/rapport/page.tsx');
const api = read('app/api/report-damages/route.ts');

test('report API is inside the central authenticated API boundary', async () => {
  const response = await proxy(new NextRequest('http://localhost/api/report-damages'));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
});

test('report page does not read Supabase tables directly from the browser', () => {
  assert.doesNotMatch(page, /from ['\"]@\/lib\/supabase['\"]/);
  assert.doesNotMatch(page, /\.from\(['\"]damages['\"]\)/);
  assert.doesNotMatch(page, /\.from\(['\"]vehicles['\"]\)/);
  assert.doesNotMatch(page, /\.from\(['\"]damage_media['\"]\)/);
  assert.match(page, /fetch\(url\)/);
  assert.match(page, /\/api\/report-damages/);
});

test('report server API verifies the user before reading report data', () => {
  assert.match(api, /verifyApiUser\(request\)/);
  assert.match(api, /from\('damages'\)/);
  assert.match(api, /from\('vehicles'\)/);
  assert.match(api, /from\('damage_media'\)/);
});
