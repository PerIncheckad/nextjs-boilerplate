import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const STATIONS = new Set(['166', '170', '274']);
const COUNT_FIELDS = ['salu_count', 'behov_count', 'utok_count', 'minskning_count', 'ordered_count'] as const;

type PlanningInput = {
  period_code?: unknown;
  model?: unknown;
  station?: unknown;
  salu_count?: unknown;
  behov_count?: unknown;
  utok_count?: unknown;
  minskning_count?: unknown;
  ordered_count?: unknown;
  note?: unknown;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function count(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function normalize(input: PlanningInput) {
  const period = cleanText(input.period_code);
  const model = cleanText(input.model);
  const station = cleanText(input.station);
  if (!period || !model || !station || !STATIONS.has(station)) return null;

  const row: Record<string, unknown> = {
    period_code: period,
    model,
    station,
    note: cleanText(input.note),
  };
  for (const field of COUNT_FIELDS) {
    const value = count(input[field]);
    if (value === null) return null;
    row[field] = value;
  }
  return row;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const period = new URL(request.url).searchParams.get('period')?.trim() || null;
  let query = adminClient()
    .from('fleet_planning_cells')
    .select('planning_cell_id,period_code,model,station,salu_count,behov_count,utok_count,minskning_count,ordered_count,note,updated_at')
    .order('model', { ascending: true })
    .order('station', { ascending: true });
  if (period) query = query.eq('period_code', period);

  const { data, error } = await query;
  if (error) {
    console.error('[fleet-planning] GET failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa planeringen' }, { status: 500 });
  }

  const { data: periodRows, error: periodError } = await adminClient()
    .from('fleet_planning_cells')
    .select('period_code')
    .order('period_code', { ascending: false });
  if (periodError) {
    console.error('[fleet-planning] period lookup failed', periodError);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsperioder' }, { status: 500 });
  }

  const periods = [...new Set((periodRows ?? []).map((row) => String(row.period_code)))];
  return NextResponse.json({ data: data ?? [], periods });
}

export async function PUT(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 });
  }

  const inputs = Array.isArray(body) ? body : [body];
  if (inputs.length === 0 || inputs.length > 500) {
    return NextResponse.json({ error: 'Ogiltigt antal planeringsrader' }, { status: 400 });
  }

  const rows = inputs.map((value) => normalize((value ?? {}) as PlanningInput));
  if (rows.some((row) => row === null)) {
    return NextResponse.json({ error: 'Planeringsrad saknar giltig period, modell, station eller antal' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload = rows.map((row) => ({ ...row, updated_at: now, updated_by: verification.user.id }));
  const { data, error } = await adminClient()
    .from('fleet_planning_cells')
    .upsert(payload, { onConflict: 'period_code,model,station' })
    .select('planning_cell_id,period_code,model,station,salu_count,behov_count,utok_count,minskning_count,ordered_count,note,updated_at');

  if (error) {
    console.error('[fleet-planning] PUT failed', error);
    return NextResponse.json({ error: 'Kunde inte spara planeringen' }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}
