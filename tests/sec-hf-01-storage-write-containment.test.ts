import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'migrations/20260910133000_sec_hf_01_storage_write_containment.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');

const targetBuckets = ['damage-photos', 'nybil-photos', 'receipts'] as const;

function policyBlocks(sql: string): string[] {
  return sql
    .split(/create policy/i)
    .slice(1)
    .map((block) => `create policy${block}`.split(/;\s*(?:\n|$)/)[0]);
}

test('SEC-HF-01 removes legacy anonymous/public and broad authenticated writes', () => {
  const requiredDrops = [
    'Give users authenticated access to folder 1h5ptwf_1',
    'Public insert to damage-photos',
    'Public upload damage-photos',
    'Public update damage-photos',
    'Allow authenticated users to upload nybil-photos',
    'Allow authenticated users to update nybil-photos',
    'Allow public uploads to nybil-photos',
    'Allow public updates to nybil-photos',
    'Allow authenticated users to upload receipts',
    'Allow authenticated users to update receipts',
    'Allow public uploads to receipts',
    'Allow public updates to receipts',
  ];

  for (const name of requiredDrops) {
    assert.match(migration, new RegExp(`drop policy if exists \\"?${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\"?`, 'i'));
  }
});

test('all new target-bucket writes require authenticated plus private.is_app_user()', () => {
  const blocks = policyBlocks(migration);
  assert.equal(blocks.length, 3, 'hotfix must create exactly three policies');

  for (const bucket of targetBuckets) {
    const block = blocks.find((candidate) => candidate.includes(`bucket_id = '${bucket}'`));
    assert.ok(block, `missing policy for ${bucket}`);
    assert.match(block, /for insert/i);
    assert.match(block, /to authenticated/i);
    assert.match(block, /private\.is_app_user\(\)/i);
    assert.doesNotMatch(block, /\bto\s+(?:public|anon)\b/i);
  }
});

test('SEC-HF-01 opens no UPDATE or DELETE policy', () => {
  const blocks = policyBlocks(migration);
  for (const block of blocks) {
    assert.doesNotMatch(block, /for\s+update/i);
    assert.doesNotMatch(block, /for\s+delete/i);
  }
});

test('SEC-HF-01 preserves bucket READ/publicity semantics', () => {
  assert.doesNotMatch(migration, /update\s+storage\.buckets/i);
  assert.doesNotMatch(migration, /alter\s+table\s+storage\.buckets/i);
  assert.doesNotMatch(migration, /for\s+select/i);
  assert.doesNotMatch(migration, /drop\s+policy[^;]*(?:read|list)/i);
});

test('SEC-HF-01 does not create policies for unrelated buckets or mutate business tables', () => {
  const blocks = policyBlocks(migration);
  for (const block of blocks) {
    assert.ok(targetBuckets.some((bucket) => block.includes(`bucket_id = '${bucket}'`)));
  }

  assert.doesNotMatch(migration, /\b(?:insert\s+into|update|delete\s+from)\s+public\./i);
  assert.doesNotMatch(migration, /\balter\s+table\s+public\./i);
});

test('path contracts are explicitly constrained for current browser writers', () => {
  assert.match(migration, /bucket_id = 'damage-photos'[\s\S]*foldername\(name\)\)\[2\] = 'SKADOR'/i);
  assert.match(migration, /bucket_id = 'damage-photos'[\s\S]*foldername\(name\)\)\[2\] like/i);
  assert.match(migration, /bucket_id = 'nybil-photos'[\s\S]*foldername\(name\)\)\[2\] = 'NYBIL-REFERENS'/i);
  assert.match(migration, /bucket_id = 'receipts'[\s\S]*foldername\(name\)\)\[2\] is null/i);
});
