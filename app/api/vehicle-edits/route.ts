import { NextResponse } from 'next/server';
import { verifyApiUser } from '@/lib/server-auth';
import { POST as legacyPOST } from './legacy-handler';

const SALU_OWNED_FIELDS = new Set([
  'saludatum',
  'salu_station',
  'salu_kopare',
  'salu_returadress',
  'salu_retur',
  'salu_attention',
  'salu_notering',
]);

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.error },
      { status: verification.status }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const edits = Array.isArray(body?.edits)
    ? body.edits.map((edit: any) => ({
        ...edit,
        edited_by: verification.user.email,
      }))
    : body?.edits;

  if (Array.isArray(edits)) {
    const blockedEdit = edits.find(
      (edit: any) => typeof edit?.field_name === 'string' && SALU_OWNED_FIELDS.has(edit.field_name),
    );
    if (blockedEdit) {
      return NextResponse.json(
        {
          error: 'SALU-owned fields must be changed in SALU',
          field: blockedEdit.field_name,
        },
        { status: 409 },
      );
    }
  }

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');

  const canonicalRequest = new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, edits }),
  });

  return legacyPOST(canonicalRequest);
}
