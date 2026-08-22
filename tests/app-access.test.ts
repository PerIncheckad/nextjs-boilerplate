import test from 'node:test';
import assert from 'node:assert/strict';

import { isPublicAppPath } from '../lib/app-access';

test('only explicit public-media paths bypass the central app auth boundary', () => {
  assert.equal(isPublicAppPath('/public-media'), true);
  assert.equal(isPublicAppPath('/public-media/damage/abc'), true);

  for (const path of ['/', '/check', '/check/drafts', '/ankomst', '/status', '/nybil', '/rapport', '/vagnkort', '/media/file']) {
    assert.equal(isPublicAppPath(path), false, `${path} must remain protected`);
  }
});

test('missing pathname is protected by default', () => {
  assert.equal(isPublicAppPath(null), false);
  assert.equal(isPublicAppPath(undefined), false);
  assert.equal(isPublicAppPath(''), false);
});
