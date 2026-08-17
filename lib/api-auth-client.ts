import { supabase } from './supabase';

export async function getApiAuthHeaders(
  headers: Record<string, string> = {}
): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error('Ingen giltig inloggningssession. Logga in igen.');
  }

  return {
    ...headers,
    Authorization: `Bearer ${accessToken}`,
  };
}
