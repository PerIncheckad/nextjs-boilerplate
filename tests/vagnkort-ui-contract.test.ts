import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/vagnkort/page.tsx'), 'utf8');
const client = readFileSync(join(process.cwd(), 'app/vagnkort/vagnkort-client.tsx'), 'utf8');
const home = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

test('Vagnkort page stays behind the existing LoginGate', () => {
  assert.match(page, /<LoginGate>/);
  assert.match(page, /<VagnkortClient \/>/);
});

test('Vagnkort reads the authenticated vehicle journey API', () => {
  assert.match(client, /fetch\(`\/api\/vehicle-journey\?reg=/);
  assert.match(client, /Bilens digitala pärm/);
  assert.match(client, /Utrustning – Nybil mot nu/);
  assert.match(client, /Tid i resan/);
  assert.match(client, /Dokument/);
  assert.match(client, /Tidslinje/);
});

test('Vagnkort surfaces baseline/current equipment changes without writing data', () => {
  assert.match(client, /baseline\[key\] !== current\[key\]/);
  assert.doesNotMatch(client, /method:\s*['"]POST['"]/);
  assert.doesNotMatch(client, /method:\s*['"]PUT['"]/);
  assert.doesNotMatch(client, /method:\s*['"]DELETE['"]/);
});

test('start page links to Vagnkort', () => {
  assert.match(home, /href="\/vagnkort"/);
});
