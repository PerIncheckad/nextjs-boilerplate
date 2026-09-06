import { NextResponse } from 'next/server';
import { verifyApiUser } from '@/lib/server-auth';
import { POST as legacyPOST } from './legacy-handler';
import { parseStoredCurrentLocation, serializeCurrentLocation } from '@/lib/status-current-location';

const SALU_OWNED_FIELDS = new Set([
  'saludatum',
]);

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.error },
      { status: verification.status }
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!isJsonRecord(parsedBody)) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const rawEdits = parsedBody.edits;
  const edits = Array.isArray(rawEdits)
    ? rawEdits.map((edit) => {
        if (!isJsonRecord(edit)) return edit;

        if (edit.field_name === 'current_location') {
          const parsedLocation = parseStoredCurrentLocation(edit.new_value);
          if (!parsedLocation) {
            return { ...edit, edited_by: verification.user.email, invalid_current_location: true };
          }

          return {
            ...edit,
            new_value: serializeCurrentLocation(parsedLocation.city, parsedLocation.station),
            edited_by: verification.user.email,
          };
        }

        return { ...edit, edited_by: verification.user.email };
      })
    : rawEdits;

  if (Array.isArray(edits)) {
    const blockedEdit = edits.find(
      (edit) => isJsonRecord(edit)
        && typeof edit.field_name === 'string'
        && SALU_OWNED_FIELDS.has(edit.field_name),
    );
    if (isJsonRecord(blockedEdit) && typeof blockedEdit.field_name === 'string') {
      return NextResponse.json(
        {
          error: 'SALU-owned fields must be changed in SALU',
          field: blockedEdit.field_name,
        },
        { status: 409 },
      );
    }

    const invalidLocationEdit = edits.find(
      (edit) => isJsonRecord(edit) && edit.invalid_current_location === true,
    );
    if (invalidLocationEdit) {
      return NextResponse.json(
        {
          error: 'Current location must contain both city and station',
          field: 'current_location',
        },
        { status: 400 },
      );
    }

    const currentLocationEdits = edits.filter(
      (edit) => isJsonRecord(edit) && edit.field_name === 'current_location',
    );
    if (currentLocationEdits.length > 1) {
      return NextResponse.json(
        {
          error: 'Current location must be saved as one atomic observation',
          field: 'current_location',
        },
        { status: 400 },
      );
    }
  }

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');

  const canonicalRequest = new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...parsedBody, edits }),
  });

  return legacyPOST(canonicalRequest);
}
