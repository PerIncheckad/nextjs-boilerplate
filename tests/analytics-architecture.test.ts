import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = path.join(process.cwd(), 'lib', 'analytics');

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

test('analytics foundation is isolated from UI, Next runtime and Supabase source access', () => {
  const forbidden = [
    /from ['\"]react['\"]/,
    /from ['\"]next(?:\/[^'\"]*)?['\"]/,
    /@supabase\/supabase-js/,
    /from ['\"]@\/app\//,
    /from ['\"]\.\.\/\.\.\/app\//,
  ];
  for (const file of files(root)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) assert.equal(pattern.test(source), false, `${path.relative(process.cwd(), file)} must not match ${pattern}`);
  }
});

test('RPT-01 foundation contains no runtime source query calls or source writes', () => {
  const forbidden = [/\.from\s*\(/, /\.rpc\s*\(/];
  for (const file of files(root)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) assert.equal(pattern.test(source), false, `${path.relative(process.cwd(), file)} must not contain source/runtime query code`);
  }
});

test('RPT-01 has no concrete cycle engine or cycle observations store', () => {
  const names = files(root).map((file) => path.basename(file));
  assert.equal(names.some((name) => /cycle-engine|cycle-observation-store/i.test(name)), false);
});
