import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/vagnkort/page.tsx'), 'utf8');
const client = readFileSync(join(process.cwd(), 'app/vagnkort/vagnkort-client.tsx'), 'utf8');
const upload = readFileSync(join(process.cwd(), 'app/vagnkort/document-upload.tsx'), 'utf8');
const uploadApi = readFileSync(join(process.cwd(), 'app/api/vehicle-documents/route.ts'), 'utf8');
const documentApi = readFileSync(join(process.cwd(), 'app/api/vehicle-documents/[id]/route.ts'), 'utf8');
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

test('Vagnkort surfaces baseline/current equipment changes', () => {
  assert.match(client, /baseline\[key\] !== current\[key\]/);
  assert.match(client, /Förändrat/);
});

test('Vagnkort document upload uses authenticated prepare/complete and signed Storage upload', () => {
  assert.match(client, /<DocumentUpload regnr=/);
  assert.match(upload, /action:\s*'prepare'/);
  assert.match(upload, /uploadToSignedUrl/);
  assert.match(upload, /action:\s*'complete'/);
  assert.match(upload, /Släpp filer här/);
  assert.match(upload, /Leverantörsfaktura/);
  assert.match(upload, /Skadebild/);
});

test('document server API verifies identity, keeps private storage server controlled and appends a journey event', () => {
  assert.match(uploadApi, /verifyApiUser\(request\)/);
  assert.match(uploadApi, /createSignedUploadUrl/);
  assert.match(uploadApi, /vehicle_documents/);
  assert.match(uploadApi, /DOCUMENT_UPLOADED/);
  assert.match(uploadApi, /uploaded_by:\s*verification\.user\.id/);
  assert.match(documentApi, /verifyApiUser\(request\)/);
  assert.match(documentApi, /createSignedUrl/);
  assert.match(documentApi, /300/);
});

test('start page links to Vagnkort', () => {
  assert.match(home, /href="\/vagnkort"/);
});
