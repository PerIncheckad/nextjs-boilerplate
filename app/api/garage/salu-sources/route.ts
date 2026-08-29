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
      .is('voided_at', null)
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
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 });
  }

  const flagId = clean(body.salu_flag_id);
  const direction = clean(body.garage_direction)?.toUpperCase() ?? '';
  const station = clean(body.planned_station);
  if (!flagId || !DIRECTIONS.has(direction) || !station) {
    return NextResponse.json({ error: 'SALU-cykel, riktning och planerad station krävs' }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc('materialize_salu_to_garage', {
    p_flag_id: flagId,
    p_direction: direction,
    p_station: station,
    p_actor: verification.user.id,
  });

  if (error) {
    console.error('[garage salu sources] atomic handoff failed', error);
    const message = error.message ?? 'Kunde inte hämta SALU-bilen till Garaget';
    if (message.includes('Planerad station är inte aktiv') || message.includes('Ogiltig riktning')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes('SALU-cykeln finns inte')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Kunde inte hämta SALU-bilen till Garaget' }, { status: 500 });
  }

  const result = data as { already_exists?: boolean; data?: unknown } | null;
  if (result?.already_exists) {
    return NextResponse.json({ error: 'Den här SALU-cykeln finns redan i Garaget' }, { status: 409 });
  }

  return NextResponse.json({ data: result?.data ?? null }, { status: 201 });
}
