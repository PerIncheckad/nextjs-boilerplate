import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyApiUser, type VerifyApiUserResult } from '@/lib/server-auth';
import type { AnalyticsPrincipal } from './evaluation-integrity';

export type AnalyticsAccessDecision =
  | { allowed: true; principal: AnalyticsPrincipal }
  | {
      allowed: false;
      status: 401 | 403;
      code: 'AUTHENTICATION_REQUIRED' | 'ACCESS_DENIED';
      error: string;
    };

export type AnalyticsServerAccess =
  | {
      ok: true;
      principal: AnalyticsPrincipal;
      sourceClient: SupabaseClient;
      evaluationSecret: string;
      engineBuildSha: string;
    }
  | {
      ok: false;
      status: 401 | 403 | 503;
      code: 'AUTHENTICATION_REQUIRED' | 'ACCESS_DENIED' | 'ANALYTICS_RUNTIME_UNAVAILABLE';
      error: string;
    };

export function classifyAnalyticsVerification(verification: VerifyApiUserResult): AnalyticsAccessDecision {
  if (!verification.ok) {
    return {
      allowed: false,
      status: verification.status,
      code: verification.status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED',
      error: verification.error,
    };
  }
  return {
    allowed: true,
    principal: { id: verification.user.id, email: verification.user.email.toLowerCase() },
  };
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function deriveEvaluationSecret(serviceRoleKey: string): string {
  return createHash('sha256')
    .update('INCHECKAD_ANALYTICS_EVALUATION_V1\0')
    .update(serviceRoleKey)
    .digest('hex');
}

export async function authorizeAnalyticsServerRequest(request: Request): Promise<AnalyticsServerAccess> {
  const decision = classifyAnalyticsVerification(await verifyApiUser(request));
  if (!decision.allowed) {
    return {
      ok: false,
      status: decision.status,
      code: decision.code,
      error: decision.error,
    };
  }

  const token = bearerToken(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const engineBuildSha = process.env.VERCEL_GIT_COMMIT_SHA;

  if (!token || !supabaseUrl || !anonKey || !serviceRoleKey || !engineBuildSha) {
    return {
      ok: false,
      status: 503,
      code: 'ANALYTICS_RUNTIME_UNAVAILABLE',
      error: 'Analytics runtime unavailable',
    };
  }

  // Source reads use the authenticated caller token. Existing Check-in RLS therefore
  // restricts the source population before aggregation. service_role is never used
  // as the source client; its existing secret only derives transient envelope integrity.
  const sourceClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  return {
    ok: true,
    principal: decision.principal,
    sourceClient,
    evaluationSecret: deriveEvaluationSecret(serviceRoleKey),
    engineBuildSha,
  };
}
