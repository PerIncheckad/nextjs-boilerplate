import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyApiUser } from '@/lib/server-auth';

function isSchedulerRequestAuthorized(request: NextRequest): boolean {
  const authorization = request.headers.get('authorization');

  if (request.nextUrl.pathname === '/api/salu/scheduler') {
    const tokens = [process.env.SALU_SCHEDULER_TOKEN, process.env.CRON_SECRET].filter(
      (token): token is string => Boolean(token),
    );
    return tokens.some((token) => authorization === `Bearer ${token}`);
  }

  if (request.nextUrl.pathname === '/api/checkpoint-actions/scheduler') {
    const tokens = [
      process.env.CHECKPOINT_ACTION_SCHEDULER_TOKEN,
      process.env.CRON_SECRET,
    ].filter((token): token is string => Boolean(token));
    return tokens.some((token) => authorization === `Bearer ${token}`);
  }

  return false;
}

export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();

  if (url.searchParams.has('error') || url.searchParams.has('error_description')) {
    console.error('Auth error:', url.searchParams.get('error'), url.searchParams.get('error_description'));
  }

  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/health') {
    return NextResponse.next();
  }

  if (isSchedulerRequestAuthorized(request)) {
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
