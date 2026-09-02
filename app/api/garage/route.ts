import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REASONS = new Set(['BEHOV', 'UTOK', 'MINSKNING', 'SALU', 'SALU_RETUR', 'ANNAT']);
const CONFIRMATION = new Set(['PLANERAD', 'BESTALLD', 'AVROPAD', 'AVVAKTAR_BEKRAFTELSE', 'BEKRAFTAD']);
const TRANSPORT = new Set(['EJ_BOKAD', 'TRANSPORTBOKAD', 'PA_VAG']);
const DIRECTIONS = new Set(['IN', 'UT']);
const HOLDING_PERIODS = new Set([4, 6, 9, 12, 18, 24]);
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function text(value: unknown): string | null { if (typeof value !== 'string') return null; const next = value.trim(); return next || null; }
function upper(value: unknown): string | null { const next = text(value); return next ? next.toUpperCase() : null; }
function date(value: unknown): string | null { const next = text(value); return !next ? null : /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null; }
function money(value: unknown): number | null { if (value === null || value === undefined || value === '') return null; const numeric = Number(value); return Number.isFinite(numeric) && numeric >= 0 ? numeric : null; }
function holdingPeriod(value: unknown): number | null { if (value === null || value === undefined || value === '') return null; const numeric = Number(value); return Number.isInteger(numeric) && HOLDING_PERIODS.has(numeric) ? numeric : null; }
function regKey(value: unknown): string | null { if (typeof value !== 'string') return null; const next = value.replace(/\s+/g, '').toUpperCase().trim(); return next || null; }

async function loadStations(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin.from('planning_stations').select('station_code,display_name,sort_order').eq('is_active', true).order('sort_order', { ascending: true }).order('station_code', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
async function loadModels(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin.from('planning_vehicle_models').select('model_code,display_name,sort_order').eq('is_active', true).order('sort_order', { ascending: true }).order('display_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
async function loadNybilRegKeys(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin.from('nybil_inventering').select('regnr').not('regnr', 'is', null);
  if (error) throw error;
  return new Set((data ?? []).map((row) => regKey(row.regnr)).filter((value): value is string => Boolean(value)));
}
async function ensureModel(admin: ReturnType<typeof adminClient>, rawModel: unknown, userId: string) {
  const display = text(rawModel); const code = upper(rawModel); if (!display || !code) return null;
  const { data: existing, error: lookupError } = await admin.from('planning_vehicle_models').select('display_name').eq('model_code', code).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.display_name) return String(existing.display_name);
  const now = new Date().toISOString();
  const { error } = await admin.from('planning_vehicle_models').insert({ model_code: code, display_name: display, is_active: true, created_at: now, updated_at: now, created_by: userId, updated_by: userId });
  if (error) throw error;
  return display;
}

function normalizeBody(body: Record<string, unknown>, stations: Set<string>, partial = false) {
  const out: Record<string, unknown> = {};
  const fields = ['planning_period', 'model', 'supplier', 'order_reference', 'saluort', 'note'] as const;
  for (const field of fields) if (!partial || Object.hasOwn(body, field)) out[field] = text(body[field]);
  if (!partial && !out.model) return null;
  if (Object.hasOwn(body, 'model') && !out.model) return null;
  if (Object.hasOwn(out, 'planning_period') && out.planning_period && !MONTH_RE.test(String(out.planning_period))) return null;
  if (!partial || Object.hasOwn(body, 'garage_direction')) { const value = upper(body.garage_direction); if (!partial && !value) return null; if (value && !DIRECTIONS.has(value)) return null; out.garage_direction = value; }
  if (!partial || Object.hasOwn(body, 'planning_reason')) { const value = upper(body.planning_reason) ?? 'BEHOV'; if (!REASONS.has(value)) return null; out.planning_reason = value; }
  if (!partial || Object.hasOwn(body, 'planned_station')) { const value = text(body.planned_station); if (value && !stations.has(value)) return null; out.planned_station = value; }
  if (!partial || Object.hasOwn(body, 'confirmation_status')) { const value = upper(body.confirmation_status) ?? 'PLANERAD'; if (!CONFIRMATION.has(value)) return null; out.confirmation_status = value; }
  if (!partial || Object.hasOwn(body, 'transport_status')) { const value = upper(body.transport_status) ?? 'EJ_BOKAD'; if (!TRANSPORT.has(value)) return null; out.transport_status = value; }
  if (!partial || Object.hasOwn(body, 'regnr')) out.regnr = upper(body.regnr);
  if (!partial || Object.hasOwn(body, 'vin')) out.vin = upper(body.vin);
  if (!partial || Object.hasOwn(body, 'source_regnr')) out.source_regnr = upper(body.source_regnr);
  if (!partial || Object.hasOwn(body, 'ordered_at')) out.ordered_at = date(body.ordered_at);
  if (!partial || Object.hasOwn(body, 'calloff_at')) out.calloff_at = date(body.calloff_at);
  if (!partial || Object.hasOwn(body, 'planned_delivery_date')) out.planned_delivery_date = date(body.planned_delivery_date);
  if (!partial || Object.hasOwn(body, 'daily_rate')) { const value = money(body.daily_rate); if (body.daily_rate !== null && body.daily_rate !== undefined && body.daily_rate !== '' && value === null) return null; out.daily_rate = value; }
  if (!partial || Object.hasOwn(body, 'holding_period_months')) { const value = holdingPeriod(body.holding_period_months); if (body.holding_period_months !== null && body.holding_period_months !== undefined && body.holding_period_months !== '' && value === null) return null; out.holding_period_months = value; }
  return out;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });
  const admin = adminClient();
  let stationRows: Array<{ station_code: string; display_name: string | null; sort_order: number }>;
  let modelRows: Array<{ model_code: string; display_name: string; sort_order: number }>;
  try { [stationRows, modelRows] = await Promise.all([loadStations(admin) as Promise<typeof stationRows>, loadModels(admin) as Promise<typeof modelRows>]); }
  catch (error) { console.error('[garage] reference lookup failed', error); return NextResponse.json({ error: 'Kunde inte läsa planeringsregister' }, { status: 500 }); }
  const stations = new Set(stationRows.map((row) => row.station_code));
  const params = new URL(request.url).searchParams;
  const period = params.get('period')?.trim() || null;
  const station = params.get('station')?.trim() || null;
  const direction = upper(params.get('direction'));
  let query = admin.from('garage_items').select('garage_item_id,planning_period,model,garage_direction,planning_reason,supplier,order_reference,regnr,vin,source_regnr,planned_station,saluort,daily_rate,holding_period_months,ordered_at,calloff_at,confirmation_status,transport_status,planned_delivery_date,note,source_kind,source_planning_cell_id,source_planning_unit_no,source_salu_flag_id,created_at,updated_at').is('voided_at', null).is('handed_off_nybil_id', null).order('updated_at', { ascending: false });
  if (period) query = query.eq('planning_period', period);
  if (station && stations.has(station)) query = query.eq('planned_station', station);
  if (direction && DIRECTIONS.has(direction)) query = query.eq('garage_direction', direction);
  const { data, error } = await query;
  if (error) { console.error('[garage] GET failed', error); return NextResponse.json({ error: 'Kunde inte läsa Garaget' }, { status: 500 }); }

  const rows = data ?? [];
  let nybilRegKeys = new Set<string>();
  if (rows.some((row) => row.garage_direction === 'IN' && Boolean(regKey(row.regnr)))) {
    try { nybilRegKeys = await loadNybilRegKeys(admin); }
    catch (lookupError) { console.error('[garage] Ny bil overlap lookup failed', lookupError); return NextResponse.json({ error: 'Kunde inte avgränsa historisk Ny bil-data från aktivt Garage' }, { status: 500 }); }
  }

  const activeRows = rows.filter((row) => {
    if (row.garage_direction !== 'IN') return true;
    const key = regKey(row.regnr);
    return !key || !nybilRegKeys.has(key);
  });

  return NextResponse.json({ data: activeRows, stations: stationRows, models: modelRows });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }
  const admin = adminClient();
  let stationRows: Array<{ station_code: string }>;
  try { stationRows = await loadStations(admin) as Array<{ station_code: string }>; } catch (error) { console.error('[garage] station lookup failed', error); return NextResponse.json({ error: 'Kunde inte läsa planeringsstationer' }, { status: 500 }); }
  const normalized = normalizeBody(body, new Set(stationRows.map((row) => row.station_code)));
  if (!normalized) return NextResponse.json({ error: 'Ogiltiga Garage-data: modell, riktning, station och hålltid måste vara giltiga' }, { status: 400 });
  try { normalized.model = await ensureModel(admin, normalized.model, verification.user.id); } catch (error) { console.error('[garage] model register failed', error); return NextResponse.json({ error: 'Kunde inte uppdatera modellregistret' }, { status: 500 }); }
  const now = new Date().toISOString();
  const payload = { ...normalized, source_kind: 'MANUELL', created_at: now, updated_at: now, created_by: verification.user.id, updated_by: verification.user.id };
  const { data, error } = await admin.from('garage_items').insert(payload).select('*').single();
  if (error) { console.error('[garage] POST failed', error); return NextResponse.json({ error: 'Kunde inte skapa Garage-objekt' }, { status: 500 }); }
  if (data.garage_direction) {
    const { error: directionError } = await admin.from('garage_direction_events').insert({ garage_item_id: data.garage_item_id, from_direction: null, to_direction: data.garage_direction, reason: text(body.direction_change_reason) ?? 'Riktning satt vid skapande', changed_at: now, changed_by: verification.user.id });
    if (directionError) console.error('[garage] initial direction audit failed after item insert', directionError);
  }
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }
  const id = text(body.garage_item_id);
  if (!id) return NextResponse.json({ error: 'garage_item_id saknas' }, { status: 400 });
  const admin = adminClient();

  const { data: activeItem, error: activeError } = await admin.from('garage_items').select('garage_item_id,handed_off_nybil_id').eq('garage_item_id', id).is('voided_at', null).maybeSingle();
  if (activeError) return NextResponse.json({ error: 'Kunde inte läsa Garage-objektet' }, { status: 500 });
  if (!activeItem) return NextResponse.json({ error: 'Garage-objektet finns inte eller är makulerat' }, { status: 404 });
  if (activeItem.handed_off_nybil_id) return NextResponse.json({ error: 'Garage-objektet är mottaget i Ny bil och är fryst' }, { status: 409 });

  let stationRows: Array<{ station_code: string }>;
  try { stationRows = await loadStations(admin) as Array<{ station_code: string }>; } catch (error) { console.error('[garage] station lookup failed', error); return NextResponse.json({ error: 'Kunde inte läsa planeringsstationer' }, { status: 500 }); }

  if (Object.hasOwn(body, 'planned_station')) {
    const nextStation = text(body.planned_station);
    if (nextStation && !new Set(stationRows.map((row) => row.station_code)).has(nextStation)) return NextResponse.json({ error: 'Ogiltig station' }, { status: 400 });
    const { data, error } = await admin.rpc('replan_garage_station', { p_garage_item_id: id, p_to_station: nextStation, p_reason: text(body.station_change_reason), p_actor: verification.user.id });
    if (error) { console.error('[garage] station RPC failed', error); return NextResponse.json({ error: 'Kunde inte omplanera station' }, { status: 500 }); }
    return NextResponse.json({ data });
  }

  if (Object.hasOwn(body, 'garage_direction')) {
    const nextDirection = upper(body.garage_direction);
    if (!nextDirection || !DIRECTIONS.has(nextDirection)) return NextResponse.json({ error: 'Välj IN eller UT' }, { status: 400 });
    const { data, error } = await admin.rpc('change_garage_direction', { p_garage_item_id: id, p_to_direction: nextDirection, p_reason: text(body.direction_change_reason), p_actor: verification.user.id });
    if (error) { console.error('[garage] direction RPC failed', error); return NextResponse.json({ error: 'Kunde inte ändra riktning' }, { status: 500 });
    return NextResponse.json({ data });
  }

  const normalized = normalizeBody(body, new Set(stationRows.map((row) => row.station_code)), true);
  if (!normalized || Object.keys(normalized).length === 0) return NextResponse.json({ error: 'Inga giltiga ändringar' }, { status: 400 });
  if (Object.hasOwn(normalized, 'model')) {
    try { normalized.model = await ensureModel(admin, normalized.model, verification.user.id); } catch (error) { console.error('[garage] model register failed', error); return NextResponse.json({ error: 'Kunde inte uppdatera modellregistret' }, { status: 500 }); }
  }
  const now = new Date().toISOString();
  const { data, error } = await admin.from('garage_items').update({ ...normalized, updated_at: now, updated_by: verification.user.id }).eq('garage_item_id', id).is('voided_at', null).select('*').single();
  if (error) { console.error('[garage] PATCH failed', error); return NextResponse.json({ error: 'Kunde inte uppdatera Garage-objektet' }, { status: 500 }); }
  return NextResponse.json({ data });
}
