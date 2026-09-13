import { supabase } from './supabase';

let installed = false;
let originalFetch: typeof window.fetch | null = null;

function isProtectedSameOriginApi(input: RequestInfo | URL): boolean {
  if (typeof window === 'undefined') return false;

  const url = input instanceof Request
    ? new URL(input.url, window.location.origin)
    : new URL(input.toString(), window.location.origin);

  return url.origin === window.location.origin &&
    url.pathname.startsWith('/api/') &&
    url.pathname !== '/api/health';
}

function nativeFetch(): typeof window.fetch {
  if (typeof window === 'undefined') {
    throw new Error('Authenticated API fetch is only available in the browser.');
  }
  return originalFetch ?? window.fetch.bind(window);
}

async function currentAccessToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('Ingen giltig inloggningssession. Logga in igen.');
  }
  return session.access_token;
}

export async function authenticatedApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const directFetch = nativeFetch();

  if (!isProtectedSameOriginApi(input)) {
    return directFetch(input, init);
  }

  const accessToken = await currentAccessToken();
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  );
  headers.set('Authorization', `Bearer ${accessToken}`);

  return directFetch(input, {
    ...init,
    headers,
  });
}

export function installAuthenticatedApiFetch(): () => void {
  if (typeof window === 'undefined' || installed) return () => {};

  originalFetch = window.fetch.bind(window);
  window.fetch = authenticatedApiFetch;
  installed = true;

  return () => {
    if (installed && originalFetch) {
      window.fetch = originalFetch;
      installed = false;
      originalFetch = null;
    }
  };
}
