import { NextResponse } from 'next/server';
import { verifyApiUser } from '@/lib/server-auth';
import { withVerifiedNotifyIdentity } from '@/lib/notify-identity';
import { POST as legacyPOST } from './legacy-handler';

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

  const meta = withVerifiedNotifyIdentity(body?.meta, verification.user);

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');

  const canonicalRequest = new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, meta }),
  });

  return legacyPOST(canonicalRequest);
}
