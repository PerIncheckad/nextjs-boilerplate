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

export function installAuthenticatedApiFetch(): () => void {
  if (typeof window === 'undefined' || installed) return () => {};

  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isProtectedSameOriginApi(input)) {
      return originalFetch!(input, init);
    }

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      throw new Error('Ingen giltig inloggningssession. Logga in igen.');
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    headers.set('Authorization', `Bearer ${accessToken}`);

    return originalFetch!(input, {
      ...init,
      headers,
    });
  };

  installed = true;

  return () => {
    if (installed && originalFetch) {
      window.fetch = originalFetch;
      installed = false;
      originalFetch = null;
    }
  };
}
