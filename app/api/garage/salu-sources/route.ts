import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const DIRECTIONS = new Set(['IN', 'UT']);

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

  const admin = adminClient();
  const { data: flags, error } = await admin
    .from('salu_flags')
    .select('flag_id,regnr,cycle_saludatum,current_saludatum,status,closure_outcome,closure_comment,created_at')
    .neq('status', 'STÄNGD')
    .order('current_saludatum', { ascending: true });
  if (error) {
    console.error('[garage salu sources] SALU lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa SALU' }, { status: 500 });
  }

  const ids = (flags ?? []).map((row) => row.flag_id);
  let imported = new Set<string>();
  if (ids.length > 0) {
    const { data, error: importedError } = await admin
      .from('garage_items')
      .select('source_salu_flag_id')
      .eq('source_kind', 'SALU')
      .in('source_salu_flag_id', ids);
    if (importedError) {
      console.error('[garage salu sources] imported lookup failed', importedError);
      return NextResponse.json({ error: 'Kunde inte läsa redan hämtade SALU-bilar' }, { status: 500 });
    }
    imported = new Set((data ?? []).map((row) => String(row.source_salu_flag_id)));
  }

  const regnrs = [...new Set((flags ?? []).map((row) => String(row.regnr)))];
  const vehicleMap = new Map<string, { brand: string | null; model: string | null }>();
  if (regnrs.length > 0) {
    const { data: vehicles, error: vehicleError } = await admin.from('vehicles').select('regnr,brand,model').in('regnr', regnrs);
    if (vehicleError) {
      console.error('[garage salu sources] vehicle lookup failed', vehicleError);
      return NextResponse.json({ error: 'Kunde inte läsa fordonsregister' }, { status: 500 });
    }
    for (const vehicle of vehicles ?? []) vehicleMap.set(String(vehicle.regnr), { brand: vehicle.brand, model: vehicle.model });
  }

  return NextResponse.json({
    data: (flags ?? []).map((row) => ({
      ...row,
      imported: imported.has(String(row.flag_id)),
      brand: vehicleMap.get(String(row.regnr))?.brand ?? null,
      model: vehicleMap.get(String(row.regnr))?.model ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }
  const flagId = clean(body.salu_flag_id);
  const direction = clean(body.garage_direction)?.toUpperCase() ?? '';
  const station = clean(body.planned_station);
  if (!flagId || !DIRECTIONS.has(direction) || !station) return NextResponse.json({ error: 'SALU-cykel, riktning och planerad station krävs' }, { status: 400 });

  const admin = adminClient();
  const { data: stationRow, error: stationError } = await admin.from('planning_stations').select('station_code').eq('station_code', station).eq('is_active', true).maybeSingle();
  if (stationError) return NextResponse.json({ error: 'Kunde inte kontrollera station' }, { status: 500 });
  if (!stationRow) return NextResponse.json({ error: 'Planerad station är inte aktiv' }, { status: 400 });

  const { data: flag, error: flagError } = await admin.from('salu_flags').select('flag_id,regnr,cycle_saludatum,current_saludatum,status,closure_comment').eq('flag_id', flagId).maybeSingle();
  if (flagError) return NextResponse.json({ error: 'Kunde inte läsa SALU-cykeln' }, { status: 500 });
  if (!flag) return NextResponse.json({ error: 'SALU-cykeln finns inte' }, { status: 404 });

  const { data: existing, error: existingError } = await admin.from('garage_items').select('garage_item_id').eq('source_kind', 'SALU').eq('source_salu_flag_id', flagId).maybeSingle();
  if (existingError) return NextResponse.json({ error: 'Kunde inte kontrollera befintligt Garage-objekt' }, { status: 500 });
  if (existing) return NextResponse.json({ error: 'Den här SALU-cykeln finns redan i Garaget' }, { status: 409 });

  const { data: vehicle, error: vehicleError } = await admin.from('vehicles').select('brand,model').eq('regnr', flag.regnr).maybeSingle();
  if (vehicleError) return NextResponse.json({ error: 'Kunde inte läsa fordonet' }, { status: 500 });
  const model = [vehicle?.brand, vehicle?.model].filter(Boolean).join(' ').trim() || String(flag.regnr);
  const now = new Date().toISOString();
  const note = [flag.closure_comment, `Hämtad från SALU ${flag.current_saludatum}`].filter(Boolean).join(' · ');

  const { data, error } = await admin.from('garage_items').insert({
    planning_period: String(flag.current_saludatum).slice(0, 7),
    model,
    garage_direction: direction,
    planning_reason: 'SALU',
    regnr: flag.regnr,
    source_regnr: flag.regnr,
    planned_station: station,
    confirmation_status: 'PLANERAD',
    transport_status: 'EJ_BOKAD',
    source_kind: 'SALU',
    source_salu_flag_id: flag.flag_id,
    note: note || null,
    created_at: now,
    updated_at: now,
    created_by: verification.user.id,
    updated_by: verification.user.id,
  }).select('*').single();
  if (error) {
    console.error('[garage salu sources] insert failed', error);
    return NextResponse.json({ error: 'Kunde inte hämta SALU-bilen till Garaget' }, { status: 500 });
  }

  const { error: eventError } = await admin.from('garage_direction_events').insert({ garage_item_id: data.garage_item_id, from_direction: null, to_direction: direction, reason: 'Hämtad från SALU', changed_at: now, changed_by: verification.user.id });
  if (eventError) console.error('[garage salu sources] direction audit failed after insert', eventError);

  return NextResponse.json({ data }, { status: 201 });
}
