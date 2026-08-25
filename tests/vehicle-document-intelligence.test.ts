import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync('app/api/vehicle-documents/route.ts', 'utf8');
const upload = readFileSync('app/vagnkort/document-upload.tsx', 'utf8');
const vagnkort = readFileSync('app/vagnkort/vagnkort-client.tsx', 'utf8');
const migration = readFileSync('migrations/20260825152000_backfill_vehicle_document_fingerprint.sql', 'utf8');

test('document uploads retain source evidence and reject exact duplicate files', () => {
  assert.match(route, /verifyApiUser/);
  assert.match(route, /contentFingerprint/);
  assert.match(route, /SUPABASE_STORAGE_ETAG/);
  assert.match(route, /\.contains\('metadata', \{ contentFingerprint \}\)/);
  assert.match(route, /Exakt samma fil finns redan på Vagnkortet/);
  assert.match(route, /storage\.from\(BUCKET\)\.remove\(\[path\]\)/);
});

test('historical vehicle documents can be fingerprinted without deleting evidence', () => {
  assert.match(migration, /update public\.vehicle_documents/);
  assert.match(migration, /from storage\.objects/);
  assert.match(migration, /contentFingerprint/);
  assert.doesNotMatch(migration, /delete\s+from/i);
});

test('invoice and receipt source facts are explicitly non-monetary interpretation', () => {
  assert.match(upload, /Källfakta från dokumentet/);
  assert.match(upload, /Leverantör/);
  assert.match(upload, /Faktura-\/kvittonummer/);
  assert.match(upload, /Totalbelopp/);
  assert.match(route, /provenance: 'USER_ENTERED'/);
  assert.match(route, /monetaryInterpretation: false/);
  assert.match(vagnkort, /Dokumentbelopp/);
  assert.match(vagnkort, /ingen bedömning av kostnadsansvar eller ekonomiskt utfall/);
});

test('Vagnkort surfaces exact duplicate evidence instead of silently merging records', () => {
  assert.match(vagnkort, /EXAKT FIL-DUBBLETT/);
  assert.match(vagnkort, /fingerprintCounts/);
  assert.match(vagnkort, /Visa dokument/);
});
