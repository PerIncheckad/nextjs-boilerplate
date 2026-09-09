import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = path.join(process.cwd(), 'lib', 'analytics');
const apiRoot = path.join(process.cwd(), 'app', 'api', 'analytics');

function files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

function isSourceAdapter(file: string): boolean {
  return file.includes(`${path.sep}source-adapters${path.sep}`);
}

function isServerConsumerBoundary(file: string): boolean {
  return file.endsWith(`${path.sep}server-consumer.ts`);
}

test('analytics core is isolated from UI and Next runtime', () => {
  const forbidden = [
    /from ['\"]react['\"]/,
    /from ['\"]next(?:\/[^'\"]*)?['\"]/,
    /from ['\"]@\/app\//,
    /from ['\"]\.\.\/\.\.\/app\//,
  ];
  for (const file of files(root)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) assert.equal(pattern.test(source), false, `${path.relative(process.cwd(), file)} must not match ${pattern}`);
  }
});

test('Supabase dependency is confined to source adapter and authenticated server consumer boundary', () => {
  for (const file of files(root).filter((candidate) => !isSourceAdapter(candidate) && !isServerConsumerBoundary(candidate))) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(/@supabase\/supabase-js/.test(source), false, `${path.relative(process.cwd(), file)} must not import Supabase`);
  }
});

test('runtime source query calls are confined to source adapters', () => {
  const fromAccess = /\.from\s*\(/;
  const rpcAccess = /\.rpc\s*\(/;
  for (const file of files(root).filter((candidate) => !isSourceAdapter(candidate))) {
    const source = fs.readFileSync(file, 'utf8');
    const sourceWithoutBufferFrom = source.replace(/\bBuffer\.from\s*\(/g, '');
    assert.equal(fromAccess.test(sourceWithoutBufferFrom), false, `${path.relative(process.cwd(), file)} must not contain source/runtime query code`);
    assert.equal(rpcAccess.test(source), false, `${path.relative(process.cwd(), file)} must not contain source/runtime query code`);
  }
});

test('all analytics source adapters remain read-only', () => {
  const sourceFiles = files(root).filter(isSourceAdapter);
  assert.ok(sourceFiles.some((file) => file.endsWith(`${path.sep}checkin.ts`)));
  const forbiddenWrites = [/\.insert\s*\(/, /\.update\s*\(/, /\.upsert\s*\(/, /\.delete\s*\(/];
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbiddenWrites) assert.equal(pattern.test(source), false, `${path.relative(process.cwd(), file)} must remain read-only`);
  }
});

test('all analytics API paths are read-only and cannot write to source tables', () => {
  const forbiddenWrites = [/\.insert\s*\(/, /\.update\s*\(/, /\.upsert\s*\(/, /\.delete\s*\(/];
  for (const file of files(apiRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbiddenWrites) assert.equal(pattern.test(source), false, `${path.relative(process.cwd(), file)} must remain read-only`);
  }
});

test('RPT-03 Check-in adapter reads only canonical fields and no station, city, damage, created_at or regnr', () => {
  const file = path.join(root, 'source-adapters', 'checkin.ts');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /id,status,completed_at/);
  assert.equal(/current_station|current_city|current_location|damage|created_at|regnr/.test(source), false);
});

test('RPT-03 server consumer uses existing verifyApiUser and caller bearer token for source RLS', () => {
  const file = path.join(root, 'server-consumer.ts');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /verifyApiUser\(request\)/);
  assert.match(source, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.equal(/createClient\([^,]+,\s*serviceRoleKey/.test(source), false);
});

test('RPT-01/RPT-02/RPT-03 have no persistence, grouped analytics, export or concrete cycle engine', () => {
  const names = [...files(root), ...files(apiRoot)].map((file) => path.basename(file));
  assert.equal(names.some((name) => /cycle-engine|cycle-observation-store|metric-results-store|evaluation-store|contributor-store|export/i.test(name)), false);
  const allSource = [...files(root), ...files(apiRoot)].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.equal(/metric_results|analytics_evaluations|analytics_contributors/.test(allSource), false);
});
