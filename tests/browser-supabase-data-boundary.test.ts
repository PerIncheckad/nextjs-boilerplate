import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const roots = ['app', 'components', 'lib'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);

function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) return [];
    return [fullPath];
  });
}

function isClientModule(source: string): boolean {
  const trimmed = source.trimStart();
  return trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"');
}

test('client modules never access Supabase application data directly', () => {
  const violations: string[] = [];

  for (const root of roots) {
    for (const file of walk(path.join(process.cwd(), root))) {
      const source = fs.readFileSync(file, 'utf8');
      if (!isClientModule(source)) continue;

      // Browser-side Supabase auth/session and intentional storage/media flows are allowed.
      // Application table/RPC access must go through authenticated same-origin /api routes.
      if (/\bsupabase\s*\.\s*(?:from|rpc)\s*\(/.test(source)) {
        violations.push(path.relative(process.cwd(), file));
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Direct browser Supabase application-data access found in: ${violations.join(', ')}`,
  );
});
