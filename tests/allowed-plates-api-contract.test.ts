import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

test('/api/allowed-plates rejects unauthenticated requests', async () => {
  const response = await proxy(new NextRequest('http://localhost/api/allowed-plates'));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required' });
});
