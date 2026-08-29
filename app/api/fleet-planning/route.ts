import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const COUNT_FIELDS = ['salu_count', 'behov_count', 'utok_count', 'minskning_count', 'ordered_count'] as const;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

type PlanningInput = {
  period_code?: unknown;
  model_code?: unknown;
  model?: unknown;
  station?: unknown;
  salu_count?: unknown;
  behov_count?: unknown;
  utok_count?: unknown;
  minskning_count?: unknown;
  ordered_count?: unknown;
  note?: unknown;
};

type PlanningModel = {
  model_code: string;
  display_name: string;
  brand: string;
  is_electric: boolean;
  is_automatic: boolean;
  daily_rate: number | null;
  aliases: string[] | null;
  sort_order: number;
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

function normalize(input: PlanningInput, stations: Set<string>, models: Map<string, PlanningModel>) {
  const period = cleanText(input.period_code);
  const modelCode = cleanText(input.model_code);
  const station = cleanText(input.station);
  const model = modelCode ? models.get(modelCode) : null;
  if (!period || !MONTH_RE.test(period) || !modelCode || !model || !station || !stations.has(station)) return null;

  const row: Record<string, unknown> = {
    period_code: period,
    model_code: modelCode,
    model: model.display_name,
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

async function loadStations(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin.from('planning_stations')
    .select('station_code,display_name,sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('station_code', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadModels(admin: ReturnType<typeof adminClient>): Promise<PlanningModel[]> {
  const { data, error } = await admin.from('planning_vehicle_models')
    .select('model_code,display_name,brand,is_electric,is_automatic,daily_rate,aliases,sort_order')
    .eq('is_active', true)
    .order('brand', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlanningModel[];
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = adminClient();
  const period = new URL(request.url).searchParams.get('period')?.trim() || null;
  if (period && !MONTH_RE.test(period)) return NextResponse.json({ error: 'Planeringsperiod måste vara YYYY-MM' }, { status: 400 });

  let query = admin.from('fleet_planning_cells')
    .select('planning_cell_id,period_code,model_code,model,station,salu_count,behov_count,utok_count,minskning_count,ordered_count,note,updated_at')
    .order('model', { ascending: true })
    .order('station', { ascending: true });
  if (period) query = query.eq('period_code', period);

  const [{ data, error }, { data: periodRows, error: periodError }, stationsResult, modelsResult] = await Promise.all([
    query,
    admin.from('fleet_planning_cells').select('period_code').like('period_code', '____-__').order('period_code', { ascending: false }),
    loadStations(admin).then((stations) => ({ stations })).catch((stationError: unknown) => ({ stationError })),
    loadModels(admin).then((models) => ({ models })).catch((modelError: unknown) => ({ modelError })),
  ]);

  if (error) { console.error('[fleet-planning] GET failed', error); return NextResponse.json({ error: 'Kunde inte läsa planeringen' }, { status: 500 }); }
  if (periodError) { console.error('[fleet-planning] period lookup failed', periodError); return NextResponse.json({ error: 'Kunde inte läsa planeringsperioder' }, { status: 500 }); }
  if ('stationError' in stationsResult) { console.error('[fleet-planning] station lookup failed', stationsResult.stationError); return NextResponse.json({ error: 'Kunde inte läsa planeringsstationer' }, { status: 500 }); }
  if ('modelError' in modelsResult) { console.error('[fleet-planning] model lookup failed', modelsResult.modelError); return NextResponse.json({ error: 'Kunde inte läsa modellregistret' }, { status: 500 }); }

  const periods = [...new Set((periodRows ?? []).map((row) => String(row.period_code)).filter((value) => MONTH_RE.test(value)))];
  return NextResponse.json({ data: data ?? [], periods, stations: stationsResult.stations, models: modelsResult.models });
}

export async function PUT(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  const admin = adminClient();
  let stationRows: Array<{ station_code: string }>;
  let modelRows: PlanningModel[];
  try {
    [stationRows, modelRows] = await Promise.all([
      loadStations(admin) as Promise<Array<{ station_code: string }>>,
      loadModels(admin),
    ]);
  } catch (error) {
    console.error('[fleet-planning] reference lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsregister' }, { status: 500 });
  }

  const stations = new Set(stationRows.map((row) => row.station_code));
  const models = new Map(modelRows.map((row) => [row.model_code, row]));
  const inputs = Array.isArray(body) ? body : [body];
  if (inputs.length === 0 || inputs.length > 500) return NextResponse.json({ error: 'Ogiltigt antal planeringsrader' }, { status: 400 });

  const rows = inputs.map((value) => normalize((value ?? {}) as PlanningInput, stations, models));
  if (rows.some((row) => row === null)) {
    return NextResponse.json({ error: 'Planeringsrad kräver månad YYYY-MM, aktiv modell, aktiv station och giltiga antal' }, { status: 400 });
  }

  const periods = [...new Set(rows.map((row) => String(row!.period_code)))];
  const { data: lockedPeriods, error: statusError } = await admin.from('planning_period_status')
    .select('period_code,status')
    .in('period_code', periods)
    .eq('status', 'KLAR');
  if (statusError) {
    console.error('[fleet-planning] period status lookup failed', statusError);
    return NextResponse.json({ error: 'Kunde inte kontrollera planeringsstatus' }, { status: 500 });
  }
  if ((lockedPeriods ?? []).length > 0) {
    return NextResponse.json({ error: 'Planeringen är markerad KLAR. Öppna planeringen igen innan du ändrar den.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const payload = rows.map((row) => ({ ...row, updated_at: now, updated_by: verification.user.id }));
  const { data, error } = await admin.from('fleet_planning_cells')
    .upsert(payload, { onConflict: 'period_code,model_code,station' })
    .select('planning_cell_id,period_code,model_code,model,station,salu_count,behov_count,utok_count,minskning_count,ordered_count,note,updated_at');

  if (error) { console.error('[fleet-planning] PUT failed', error); return NextResponse.json({ error: 'Kunde inte spara planeringen' }, { status: 500 }); }
  return NextResponse.json({ data: data ?? [] });
}
