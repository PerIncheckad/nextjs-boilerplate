import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Lockfile = {
  packages?: Record<string, { version?: string }>;
};

const APPROVED_NEXT_FLOOR = '16.3.3';

function compareSemver(a: string, b: string): number {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
    assert.ok(match, `Expected a semantic version, received ${value}`);
    return match.slice(1, 4).map(Number);
  };

  const left = parse(a);
  const right = parse(b);

  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }

  return 0;
}

test('resolved Next.js dependency stays at or above the approved security floor', () => {
  const lockfile = JSON.parse(
    readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8'),
  ) as Lockfile;

  const resolvedVersion = lockfile.packages?.['node_modules/next']?.version;
  assert.ok(resolvedVersion, 'package-lock.json must contain resolved node_modules/next.version');
  assert.ok(
    compareSemver(resolvedVersion, APPROVED_NEXT_FLOOR) >= 0,
    `Resolved Next.js ${resolvedVersion} is below approved security floor ${APPROVED_NEXT_FLOOR}`,
  );
});
