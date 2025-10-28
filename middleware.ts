import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // This middleware provides basic request handling and logging for the application.
  // Supabase magic link authentication is handled client-side by the Supabase SDK
  // through hash-based tokens, which don't require server-side middleware intervention.
  
  const url = request.nextUrl.clone();
  
  // Log any auth-related errors that come through query parameters
  if (url.searchParams.has('error') || url.searchParams.has('error_description')) {
    console.error('Auth error:', url.searchParams.get('error'), url.searchParams.get('error_description'));
  }
  
  return NextResponse.next();
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
