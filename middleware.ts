import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Handle Supabase magic link authentication callback
  // When a user clicks the magic link in their email, Supabase redirects to the site
  // with authentication parameters in the URL hash fragment
  // This middleware ensures they're redirected to the home page
  
  const url = request.nextUrl.clone();
  
  // Check if this is an auth callback (has hash with auth tokens)
  // Supabase uses hash-based auth flow, so we check for common patterns
  if (url.pathname === '/' && url.hash && 
      (url.hash.includes('access_token') || url.hash.includes('refresh_token'))) {
    // The auth tokens are in the hash, which is handled client-side
    // Just ensure we're on the home page
    return NextResponse.next();
  }
  
  // Check if this is a callback with error parameters
  if (url.searchParams.has('error') || url.searchParams.has('error_description')) {
    console.error('Auth error:', url.searchParams.get('error'), url.searchParams.get('error_description'));
    // Let it through to be handled by the login gate
    return NextResponse.next();
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
