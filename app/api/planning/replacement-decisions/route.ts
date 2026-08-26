import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z0-9]{2,12}$/;

type DecisionRow = {
  regnr: string;
  decision_status: 'REPLACE' | 'CANCELLED';
  salu_date_at_decision: string;
  model_snapshot: string | null;
  station_code_snapshot: string | null;
  decided_at: string;
  decided_by: string;
  updated_at: string;
  updated_by: string;
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

function normalizeRegnr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim().toUpperCase().replace(/\s+/g, '');
  return REGNR_RE.test(next) ? next : null;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const url = new URL(request.url);
  const regnrs = [...new Set((url.searchParams.get('regnrs') ?? '')
    .split(',')
    .map((value) => normalizeRegnr(value))
    .filter((value): value is string => Boolean(value)))]
    .slice(0, 500);

  if (regnrs.length === 0) return NextResponse.json({ data: [] satisfies DecisionRow[] });

  const { data, error } = await adminClient()
    .from('planning_replacement_decisions')
    .select('regnr,decision_status,salu_date_at_decision,model_snapshot,station_code_snapshot,decided_at,decided_by,updated_at,updated_by')
    .in('regnr', regnrs);

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ data: [], storageReady: false });
    console.error('[replacement decisions] read failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa ersättningsbeslut' }, { status: 500 });
  }

  return NextResponse.json({ data: (data ?? []) as DecisionRow[], storageReady: true });
}

export async function PUT(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ogiltigt beslut' }, { status: 400 });
  const source = body as Record<string, unknown>;
  const regnr = normalizeRegnr(source.regnr);
  const status = source.decisionStatus === 'REPLACE' || source.decisionStatus === 'CANCELLED' ? source.decisionStatus : null;
  const saluDate = typeof source.saluDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.saluDate) ? source.saluDate : null;
  if (!regnr || !status || !saluDate) return NextResponse.json({ error: 'regnr, beslut och SALU-datum krävs' }, { status: 400 });

  const admin = adminClient();
  const { data: saluState, error: saluError } = await admin
    .from('salu_vehicle_state')
    .select('regnr,current_saludatum')
    .eq('regnr', regnr)
    .maybeSingle();

  if (saluError) {
    console.error('[replacement decisions] SALU validation failed', saluError);
    return NextResponse.json({ error: 'Kunde inte verifiera SALU-bilen' }, { status: 500 });
  }
  if (!saluState?.current_saludatum) return NextResponse.json({ error: 'Bilen saknar verifierad SALU-status' }, { status: 409 });

  const now = new Date().toISOString();
  const payload = {
    regnr,
    decision_status: status,
    salu_date_at_decision: String(saluState.current_saludatum),
    model_snapshot: clean(source.model),
    station_code_snapshot: clean(source.stationCode),
    decided_at: now,
    decided_by: verification.user.id,
    updated_at: now,
    updated_by: verification.user.id,
  };

  const { data, error } = await admin
    .from('planning_replacement_decisions')
    .upsert(payload, { onConflict: 'regnr' })
    .select('regnr,decision_status,salu_date_at_decision,model_snapshot,station_code_snapshot,decided_at,decided_by,updated_at,updated_by')
    .single();

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ error: 'Ersättningsbeslut är ännu inte aktiverat i databasen', storageReady: false }, { status: 503 });
    console.error('[replacement decisions] write failed', error);
    return NextResponse.json({ error: 'Kunde inte spara ersättningsbeslut' }, { status: 500 });
  }

  return NextResponse.json({ data: data as DecisionRow, storageReady: true });
}
