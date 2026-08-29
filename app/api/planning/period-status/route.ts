import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATUSES = new Set(['PAGAENDE', 'KLAR']);

type FinalizeResult = {
  data?: {
    period_code?: string;
    status?: string;
    ready_at?: string | null;
    ready_by?: string | null;
    updated_at?: string;
    updated_by?: string | null;
  };
  materialized_count?: number;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const period = new URL(request.url).searchParams.get('period')?.trim() ?? '';
  if (!MONTH_RE.test(period)) return NextResponse.json({ error: 'Period måste vara YYYY-MM' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin.from('planning_period_status')
    .select('period_code,status,ready_at,ready_by,updated_at,updated_by')
    .eq('period_code', period)
    .maybeSingle();

  if (error) {
    console.error('[planning period status] GET failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsstatus' }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? { period_code: period, status: 'PAGAENDE', ready_at: null, ready_by: null } });
}

export async function PUT(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  const period = clean(body.period_code) ?? '';
  const status = clean(body.status)?.toUpperCase() ?? '';
  if (!MONTH_RE.test(period) || !STATUSES.has(status)) {
    return NextResponse.json({ error: 'period_code YYYY-MM och status PAGAENDE/KLAR krävs' }, { status: 400 });
  }

  const admin = adminClient();

  if (status === 'KLAR') {
    const { data, error } = await admin.rpc('finalize_planning_period_to_garage', {
      p_period: period,
      p_actor: verification.user.id,
    });

    if (error) {
      console.error('[planning period status] atomic Garage handoff failed', error);
      return NextResponse.json({ error: 'Planeringen kunde inte markeras KLAR och skickas till Garaget' }, { status: 500 });
    }

    const result = (data ?? {}) as FinalizeResult;
    return NextResponse.json({
      data: result.data ?? { period_code: period, status: 'KLAR' },
      materialized_count: Number(result.materialized_count ?? 0),
    });
  }

  const now = new Date().toISOString();
  const payload = {
    period_code: period,
    status: 'PAGAENDE',
    ready_at: null,
    ready_by: null,
    updated_at: now,
    updated_by: verification.user.id,
  };

  const { data, error } = await admin.from('planning_period_status')
    .upsert(payload, { onConflict: 'period_code' })
    .select('period_code,status,ready_at,ready_by,updated_at,updated_by')
    .single();

  if (error) {
    console.error('[planning period status] PUT failed', error);
    return NextResponse.json({ error: 'Kunde inte uppdatera planeringsstatus' }, { status: 500 });
  }

  return NextResponse.json({ data, materialized_count: 0 });
}
