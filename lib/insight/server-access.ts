import { createClient } from '@supabase/supabase-js';
import { isAnalyticsAccessAllowed } from '@/lib/analytics/authorization';
import type { AnalyticsCapability, AuthorizationContext } from '@/lib/analytics/contracts';
import {
  authorizeAnalyticsServerRequest,
  type AnalyticsServerAccess,
} from '@/lib/analytics/server-consumer';

export const INSIGHT_V1_CAPABILITIES = new Set<AnalyticsCapability>([
  'AGGREGATE',
  'DRILL_DOWN',
  'SOURCE_CONTRIBUTOR',
]);

type EmployeeAuthorityRow = {
  id: string;
  email: string | null;
  is_active: boolean | null;
  active: boolean | null;
};

export type InsightServerAccess = Extract<AnalyticsServerAccess, { ok: true }> & {
  employeeId: string;
  consumer: 'INSIGHT';
  capabilities: ReadonlySet<AnalyticsCapability>;
};

export type InsightAccessResult =
  | { ok: true; access: InsightServerAccess }
  | {
      ok: false;
      status: 401 | 403 | 503;
      code: 'AUTHENTICATION_REQUIRED' | 'ACCESS_DENIED' | 'ANALYTICS_RUNTIME_UNAVAILABLE';
      error: string;
    };

function createAuthorityClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function resolveExactActiveEmployee(
  rows: readonly EmployeeAuthorityRow[],
  expectedEmail: string,
): { ok: true; employeeId: string } | { ok: false } {
  if (rows.length !== 1) return { ok: false };
  const row = rows[0];
  if (row.email?.toLowerCase() !== expectedEmail.toLowerCase()) return { ok: false };
  if (row.is_active !== true || row.active === false) return { ok: false };
  return { ok: true, employeeId: row.id };
}

export async function authorizeInsightRequest(
  request: Request,
  requiredCapability: Exclude<AnalyticsCapability, 'EXPORT'>,
): Promise<InsightAccessResult> {
  const analytics = await authorizeAnalyticsServerRequest(request);
  if (!analytics.ok) return analytics;

  const authority = createAuthorityClient();
  if (!authority) {
    return {
      ok: false,
      status: 503,
      code: 'ANALYTICS_RUNTIME_UNAVAILABLE',
      error: 'INSIGHT authority lookup unavailable',
    };
  }

  const email = analytics.principal.email.toLowerCase();
  const { data: employees, error: employeeError } = await authority
    .from('employees')
    .select('id,email,is_active,active')
    .eq('email', email)
    .limit(2);

  if (employeeError) {
    console.error('[insight/access] Employee lookup failed', employeeError);
    return { ok: false, status: 403, code: 'ACCESS_DENIED', error: 'Access denied' };
  }

  const employee = resolveExactActiveEmployee(
    (employees ?? []) as EmployeeAuthorityRow[],
    email,
  );
  if (!employee.ok) {
    return { ok: false, status: 403, code: 'ACCESS_DENIED', error: 'Access denied' };
  }

  const { data: mandateAllowed, error: mandateError } = await authority.rpc(
    'actor_has_process_mandate',
    {
      p_employee_id: employee.employeeId,
      p_capability_code: 'ACCESS_INSIGHT',
      p_required_function: null,
      p_scope_type: 'GLOBAL',
      p_scope_code: null,
      p_at: new Date().toISOString(),
    },
  );

  if (mandateError) {
    console.error('[insight/access] Mandate lookup failed', mandateError);
    return { ok: false, status: 403, code: 'ACCESS_DENIED', error: 'Access denied' };
  }
  if (mandateAllowed !== true) {
    return { ok: false, status: 403, code: 'ACCESS_DENIED', error: 'Access denied' };
  }

  const authorizationContext: AuthorizationContext = {
    capabilities: INSIGHT_V1_CAPABILITIES,
    consumers: new Set(['INSIGHT']),
    sourceAccessAllowed: true,
  };
  if (!isAnalyticsAccessAllowed(authorizationContext, requiredCapability, 'INSIGHT')) {
    return { ok: false, status: 403, code: 'ACCESS_DENIED', error: 'Access denied' };
  }

  return {
    ok: true,
    access: {
      ...analytics,
      employeeId: employee.employeeId,
      consumer: 'INSIGHT',
      capabilities: INSIGHT_V1_CAPABILITIES,
    },
  };
}
