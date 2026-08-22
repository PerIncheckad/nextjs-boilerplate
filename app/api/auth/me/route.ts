import { NextResponse } from 'next/server';
import { verifyApiUser } from '@/lib/server-auth';

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);

  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  return NextResponse.json({
    data: {
      id: verification.user.id,
      email: verification.user.email,
      authorized: true,
    },
  });
}
