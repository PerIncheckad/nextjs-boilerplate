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

function isSourceAdapter(file: string): boolean {
  return file.includes(`${path.sep}source-adapters${path.sep}`);
}

test('analytics foundation is isolated from UI, Next runtime and Supabase source access', () => {
  const forbidden = [
    /from ['\"]react['\"]/,
    /from ['\"]next(?:\/[^'\"]*)?['\"]/,
    /@supabase\/supabase-js/,
    /from ['\"]@\/app\//,
    /from ['\"]\.\.\/\.\.\/app\//,
  ];
  for (const file of files(root).filter((candidate) => !isSourceAdapter(candidate))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) assert.equal(pattern.test(source), false, `${path.relative(process.cwd(), file)} must not match ${pattern}`);
  }
});

test('runtime source query calls are confined to source adapters', () => {
  const sourceAccess = [/\.from\s*\(/, /\.rpc\s*\(/];
  for (const file of files(root).filter((candidate) => !isSourceAdapter(candidate))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of sourceAccess) assert.equal(pattern.test(source), false, `${path.relative(process.cwd(), file)} must not contain source/runtime query code`);
  }
});

test('RPT-02 Check-in source adapter is read-only and contains no source writes', () => {
  const sourceFiles = files(root).filter(isSourceAdapter);
  assert.ok(sourceFiles.some((file) => file.endsWith(`${path.sep}checkin.ts`)));
  const forbiddenWrites = [/\.insert\s*\(/, /\.update\s*\(/, /\.upsert\s*\(/, /\.delete\s*\(/];
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbiddenWrites) assert.equal(pattern.test(source), false, `${path.relative(process.cwd(), file)} must remain read-only`);
  }
});

test('RPT-02 Check-in adapter reads only canonical total fields and no station, city, damage or created_at', () => {
  const file = path.join(root, 'source-adapters', 'checkin.ts');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /id,status,completed_at/);
  assert.equal(/current_station|current_city|current_location|damage|created_at/.test(source), false);
});

test('RPT-01/RPT-02 have no concrete cycle engine or cycle observations store', () => {
  const names = files(root).map((file) => path.basename(file));
  assert.equal(names.some((name) => /cycle-engine|cycle-observation-store/i.test(name)), false);
});
