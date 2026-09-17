import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  authorizeAnalyticsServerRequest,
  type AnalyticsServerAccess,
} from '@/lib/analytics/server-consumer';
import { isAnalyticsAccessAllowed } from '@/lib/analytics/authorization';
import type { AnalyticsCapability, AuthorizationContext } from '@/lib/analytics/contracts';

const INSIGHT_V1_CAPABILITIES = new Set<AnalyticsCapability>([
  'AGGREGATE',
  'DRILL_DOWN',
  'SOURCE_CONTRIBUTOR',
]);

export type InsightServerAccess = {
  ok: true;
  principal: { id: string; email: string };
  employeeId: string;
  sourceClient: SupabaseClient;
  evaluationSecret: string;
  engineBuildSha: string;
  authorization: AuthorizationContext;
};

export type InsightServerDenied = {
  ok: false;
  status: 401 | 403 | 503;
  code:
    | 'AUTHENTICATION_REQUIRED'
    | 'ACCESS_DENIED'
    | 'ANALYTICS_RUNTIME_UNAVAILABLE'
    | 'INSIGHT_AUTHORITY_UNAVAILABLE';
  error: string;
};

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveEmployeeId(admin: SupabaseClient, email: string): Promise<string | null> {
  // ilike is only a candidate read. Exact authority is decided after explicit
  // lowercase/trim normalization below so duplicate normalized emails fail closed.
  const { data, error } = await admin
    .from('employees')
    .select('id,email,is_active,active')
    .ilike('email', email);

  if (error || !Array.isArray(data)) return null;
  const matches = data.filter((row) =>
    typeof row?.email === 'string' &&
    row.email.trim().toLowerCase() === email &&
    row.is_active === true &&
    row.active !== false,
  );
  if (matches.length !== 1 || typeof matches[0]?.id !== 'string') return null;
  return matches[0].id;
}

async function hasGlobalInsightMandate(admin: SupabaseClient, employeeId: string): Promise<boolean> {
  const { data, error } = await admin.rpc('actor_has_process_mandate', {
    p_employee_id: employeeId,
    p_capability_code: 'ACCESS_INSIGHT',
    p_required_function: null,
    p_scope_type: 'GLOBAL',
    p_scope_code: null,
    p_at: new Date().toISOString(),
  });
  return !error && data === true;
}

function analyticsDenied(access: Exclude<AnalyticsServerAccess, { ok: true }>): InsightServerDenied {
  return {
    ok: false,
    status: access.status,
    code: access.code,
    error: access.error,
  };
}

export async function authorizeInsightServerRequest(
  request: Request,
): Promise<InsightServerAccess | InsightServerDenied> {
  const analytics = await authorizeAnalyticsServerRequest(request);
  if (!analytics.ok) return analyticsDenied(analytics);

  const admin = adminClient();
  if (!admin) {
    return {
      ok: false,
      status: 503,
      code: 'INSIGHT_AUTHORITY_UNAVAILABLE',
      error: 'INSIGHT authority unavailable',
    };
  }

  const normalizedEmail = analytics.principal.email.trim().toLowerCase();
  const employeeId = await resolveEmployeeId(admin, normalizedEmail);
  if (!employeeId || !(await hasGlobalInsightMandate(admin, employeeId))) {
    return { ok: false, status: 403, code: 'ACCESS_DENIED', error: 'Access denied' };
  }

  const authorization: AuthorizationContext = {
    capabilities: INSIGHT_V1_CAPABILITIES,
    consumers: new Set(['INSIGHT']),
    sourceAccessAllowed: true,
  };

  for (const capability of INSIGHT_V1_CAPABILITIES) {
    if (!isAnalyticsAccessAllowed(authorization, capability, 'INSIGHT')) {
      return { ok: false, status: 403, code: 'ACCESS_DENIED', error: 'Access denied' };
    }
  }

  return {
    ok: true,
    principal: analytics.principal,
    employeeId,
    sourceClient: analytics.sourceClient,
    evaluationSecret: analytics.evaluationSecret,
    engineBuildSha: analytics.engineBuildSha,
    authorization,
  };
}
