import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function collectSourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

test('client code does not access Supabase app data directly', () => {
  const roots = [path.join(process.cwd(), 'app'), path.join(process.cwd(), 'components')];
  const violations: string[] = [];

  for (const file of roots.flatMap(collectSourceFiles)) {
    const relative = path.relative(process.cwd(), file);
    if (relative.startsWith(`app${path.sep}api${path.sep}`)) continue;

    const source = fs.readFileSync(file, 'utf8');
    if (!/^\s*['"]use client['"];?/m.test(source)) continue;

    if (/\bsupabase\s*\.\s*(?:from|rpc)\s*\(/.test(source)) {
      violations.push(relative);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Direct browser→Supabase app-data access found in: ${violations.join(', ')}`,
  );
});
