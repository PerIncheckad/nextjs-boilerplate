import { createClient } from '@supabase/supabase-js';
import { isWhitelistedEmail } from './access-control';

export type VerifiedApiUser = {
  id: string;
  email: string;
};

export type VerifyApiUserResult =
  | { ok: true; user: VerifiedApiUser }
  | { ok: false; status: 401 | 403; error: string };

export async function verifyApiUser(request: Request): Promise<VerifyApiUserResult> {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }

  const accessToken = match[1].trim();
  if (!accessToken) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[server-auth] Missing Supabase environment configuration');
    return { ok: false, status: 403, error: 'Access verification unavailable' };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !user?.email) {
    return { ok: false, status: 401, error: 'Invalid or expired session' };
  }

  const email = user.email.toLowerCase();
  if (isWhitelistedEmail(email)) {
    return { ok: true, user: { id: user.id, email } };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: employee, error: employeeError } = await admin
    .from('employees')
    .select('email,is_active')
    .eq('email', email)
    .maybeSingle();

  if (employeeError) {
    console.error('[server-auth] Employee access lookup failed:', employeeError);
    return { ok: false, status: 403, error: 'Access verification failed' };
  }

  if (!employee?.is_active) {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  return { ok: true, user: { id: user.id, email } };
}
