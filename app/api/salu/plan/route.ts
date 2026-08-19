import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import {
  addCalendarMonths,
  calculateAutoSaludatum,
  type SaluAutoRule,
  type SaluControlMode,
} from '@/lib/salu-core';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type PlanRequest = {
  regnr?: string;
  nyDate?: string;
  make?: string;
  model?: string;
  mode?: SaluControlMode;
  manualMonths?: number;
};

type PersistedPlanRow = {
  original_saludatum: string;
  previous_saludatum: string | null;
  current_saludatum: string;
  changed: boolean;
};

function cleanRegnr(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase server configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  if (process.env.SALU_WRITES_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'SALU writes are not enabled' },
      { status: 503 },
    );
  }

  let body: PlanRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const regnr = cleanRegnr(body.regnr ?? '');
  const nyDate = body.nyDate ?? '';
  const make = (body.make ?? '').trim();
  const model = (body.model ?? '').trim();
  const mode = body.mode;

  if (!REGNR_RE.test(regnr)) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }
  if (!ISO_DATE_RE.test(nyDate)) {
    return NextResponse.json({ error: 'Invalid nyDate' }, { status: 400 });
  }
  if (!make || !model || (mode !== 'AUTO' && mode !== 'MANUELL')) {
    return NextResponse.json({ error: 'make, model and valid mode are required' }, { status: 400 });
  }

  const admin = createAdminClient();
  let saludatum: string;
  let autoRuleId: string | null = null;
  let autoRuleVersion: number | null = null;
  let autoMonthsApplied: number | null = null;
  let manualMonths: number | null = null;

  if (mode === 'MANUELL') {
    if (!Number.isInteger(body.manualMonths) || Number(body.manualMonths) <= 0) {
      return NextResponse.json({ error: 'manualMonths must be a positive integer' }, { status: 400 });
    }
    manualMonths = Number(body.manualMonths);
    saludatum = addCalendarMonths(nyDate, manualMonths);
  } else {
    const { data: ruleRows, error: ruleError } = await admin
      .from('salu_auto_rules')
      .select('rule_id,rule_version,make,model_tokens,months,priority,active')
      .eq('active', true);

    if (ruleError) {
      console.error('[SALU plan] Failed to load AUTO rules:', ruleError);
      return NextResponse.json({ error: 'Failed to load SALU rules' }, { status: 500 });
    }

    const rules: SaluAutoRule[] = (ruleRows ?? []).map((row: any) => ({
      id: row.rule_id,
      version: row.rule_version,
      make: row.make,
      modelTokens: row.model_tokens ?? [],
      months: row.months,
      priority: row.priority,
      active: row.active,
    }));

    const match = calculateAutoSaludatum({ nyDate, make, model, rules });
    if (!match) {
      return NextResponse.json(
        { error: 'No AUTO rule matched; MANUELL is required' },
        { status: 422 },
      );
    }

    saludatum = match.saludatum;
    autoRuleId = match.ruleId;
    autoRuleVersion = match.ruleVersion;
    autoMonthsApplied = match.monthsApplied;
  }

  const { data: persistedRows, error: persistError } = await admin.rpc('apply_salu_vehicle_plan', {
    p_regnr: regnr,
    p_ny_date: nyDate,
    p_saludatum: saludatum,
    p_control_mode: mode,
    p_manual_months: manualMonths,
    p_auto_rule_id: autoRuleId,
    p_auto_rule_version: autoRuleVersion,
    p_auto_months_applied: autoMonthsApplied,
    p_actor_id: verification.user.id,
  });

  if (persistError) {
    console.error('[SALU plan] Failed to persist vehicle plan:', persistError);
    return NextResponse.json({ error: 'Failed to persist SALU vehicle plan' }, { status: 500 });
  }

  const persisted = (persistedRows?.[0] ?? null) as PersistedPlanRow | null;
  if (!persisted) {
    return NextResponse.json({ error: 'SALU plan persistence returned no result' }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      regnr,
      mode,
      nyDate,
      originalSaludatum: persisted.original_saludatum,
      previousSaludatum: persisted.previous_saludatum,
      saludatum: persisted.current_saludatum,
      changed: persisted.changed,
      autoRuleId,
      autoRuleVersion,
      monthsApplied: autoMonthsApplied ?? manualMonths,
    },
  });
}
