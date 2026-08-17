import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyApiUser } from '@/lib/server-auth';

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  if (url.searchParams.has('error') || url.searchParams.has('error_description')) {
    console.error('Auth error:', url.searchParams.get('error'), url.searchParams.get('error_description'));
  }

  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/health') {
    return NextResponse.next();
  }

  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.error },
      { status: verification.status }
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-invisto-user-id', verification.user.id);
  requestHeaders.set('x-invisto-user-email', verification.user.email);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
