import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REASONS = new Set(['BEHOV', 'UTOK', 'MINSKNING', 'SALU_RETUR', 'ANNAT']);
const CONFIRMATION = new Set(['PLANERAD', 'BESTALLD', 'AVROPAD', 'AVVAKTAR_BEKRAFTELSE', 'BEKRAFTAD']);
const TRANSPORT = new Set(['EJ_BOKAD', 'TRANSPORTBOKAD', 'PA_VAG', 'ANKOMMEN']);

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function upper(value: unknown): string | null {
  const next = text(value);
  return next ? next.toUpperCase() : null;
}

function date(value: unknown): string | null {
  const next = text(value);
  if (!next) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
}

function money(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

async function loadStations(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin
    .from('planning_stations')
    .select('station_code,display_name,sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('station_code', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function normalizeBody(body: Record<string, unknown>, stations: Set<string>, partial = false) {
  const out: Record<string, unknown> = {};
  const fields = ['planning_period', 'model', 'supplier', 'order_reference', 'saluort', 'note'] as const;
  for (const field of fields) {
    if (!partial || Object.hasOwn(body, field)) out[field] = text(body[field]);
  }
  if (!partial && !out.model) return null;
  if (Object.hasOwn(body, 'model') && !out.model) return null;

  if (!partial || Object.hasOwn(body, 'planning_reason')) {
    const value = upper(body.planning_reason) ?? 'BEHOV';
    if (!REASONS.has(value)) return null;
    out.planning_reason = value;
  }
  if (!partial || Object.hasOwn(body, 'planned_station')) {
    const value = text(body.planned_station);
    if (value && !stations.has(value)) return null;
    out.planned_station = value;
  }
  if (!partial || Object.hasOwn(body, 'confirmation_status')) {
    const value = upper(body.confirmation_status) ?? 'PLANERAD';
    if (!CONFIRMATION.has(value)) return null;
    out.confirmation_status = value;
  }
  if (!partial || Object.hasOwn(body, 'transport_status')) {
    const value = upper(body.transport_status) ?? 'EJ_BOKAD';
    if (!TRANSPORT.has(value)) return null;
    out.transport_status = value;
  }

  if (!partial || Object.hasOwn(body, 'regnr')) out.regnr = upper(body.regnr);
  if (!partial || Object.hasOwn(body, 'vin')) out.vin = upper(body.vin);
  if (!partial || Object.hasOwn(body, 'source_regnr')) out.source_regnr = upper(body.source_regnr);
  if (!partial || Object.hasOwn(body, 'ordered_at')) out.ordered_at = date(body.ordered_at);
  if (!partial || Object.hasOwn(body, 'calloff_at')) out.calloff_at = date(body.calloff_at);
  if (!partial || Object.hasOwn(body, 'planned_delivery_date')) out.planned_delivery_date = date(body.planned_delivery_date);
  if (!partial || Object.hasOwn(body, 'daily_rate')) {
    const value = money(body.daily_rate);
    if (body.daily_rate !== null && body.daily_rate !== undefined && body.daily_rate !== '' && value === null) return null;
    out.daily_rate = value;
  }
  return out;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = adminClient();
  let stationRows: Array<{ station_code: string; display_name: string | null; sort_order: number }>;
  try {
    stationRows = await loadStations(admin) as typeof stationRows;
  } catch (error) {
    console.error('[garage] station lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsstationer' }, { status: 500 });
  }
  const stations = new Set(stationRows.map((row) => row.station_code));

  const params = new URL(request.url).searchParams;
  const period = params.get('period')?.trim() || null;
  const station = params.get('station')?.trim() || null;
  let query = admin
    .from('garage_items')
    .select('garage_item_id,planning_period,model,planning_reason,supplier,order_reference,regnr,vin,source_regnr,planned_station,saluort,daily_rate,ordered_at,calloff_at,confirmation_status,transport_status,planned_delivery_date,note,created_at,updated_at')
    .order('updated_at', { ascending: false });
  if (period) query = query.eq('planning_period', period);
  if (station && stations.has(station)) query = query.eq('planned_station', station);

  const { data, error } = await query;
  if (error) {
    console.error('[garage] GET failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa Garaget' }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [], stations: stationRows });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 });
  }

  const admin = adminClient();
  let stationRows: Array<{ station_code: string }>;
  try {
    stationRows = await loadStations(admin) as Array<{ station_code: string }>;
  } catch (error) {
    console.error('[garage] station lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsstationer' }, { status: 500 });
  }
  const normalized = normalizeBody(body, new Set(stationRows.map((row) => row.station_code)));
  if (!normalized) return NextResponse.json({ error: 'Ogiltiga Garage-data' }, { status: 400 });

  const now = new Date().toISOString();
  const payload = { ...normalized, created_at: now, updated_at: now, created_by: verification.user.id, updated_by: verification.user.id };
  const { data, error } = await admin.from('garage_items').insert(payload).select('*').single();
  if (error) {
    console.error('[garage] POST failed', error);
    return NextResponse.json({ error: 'Kunde inte skapa Garage-objekt' }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 });
  }

  const id = text(body.garage_item_id);
  if (!id) return NextResponse.json({ error: 'garage_item_id saknas' }, { status: 400 });

  const admin = adminClient();
  let stationRows: Array<{ station_code: string }>;
  try {
    stationRows = await loadStations(admin) as Array<{ station_code: string }>;
  } catch (error) {
    console.error('[garage] station lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsstationer' }, { status: 500 });
  }
  const normalized = normalizeBody(body, new Set(stationRows.map((row) => row.station_code)), true);
  if (!normalized || Object.keys(normalized).length === 0) return NextResponse.json({ error: 'Inga giltiga ändringar' }, { status: 400 });

  const { data: existing, error: existingError } = await admin
    .from('garage_items')
    .select('garage_item_id,planned_station')
    .eq('garage_item_id', id)
    .maybeSingle();
  if (existingError) {
    console.error('[garage] existing lookup failed', existingError);
    return NextResponse.json({ error: 'Kunde inte läsa Garage-objektet' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Garage-objektet finns inte' }, { status: 404 });

  const nextStation = Object.hasOwn(normalized, 'planned_station') ? (normalized.planned_station as string | null) : existing.planned_station;
  const stationChanged = Object.hasOwn(normalized, 'planned_station') && nextStation !== existing.planned_station;
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from('garage_items')
    .update({ ...normalized, updated_at: now, updated_by: verification.user.id })
    .eq('garage_item_id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[garage] PATCH failed', error);
    return NextResponse.json({ error: 'Kunde inte uppdatera Garage-objektet' }, { status: 500 });
  }

  if (stationChanged) {
    const { error: auditError } = await admin.from('garage_station_events').insert({
      garage_item_id: id,
      from_station: existing.planned_station,
      to_station: nextStation,
      reason: text(body.station_change_reason),
      changed_at: now,
      changed_by: verification.user.id,
    });
    if (auditError) console.error('[garage] station audit failed after item update', auditError);
  }

  return NextResponse.json({ data });
}
