import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: string | null): string | null {
  const next = value?.trim();
  return next || null;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = adminClient();
  const params = new URL(request.url).searchParams;
  const garageItemId = text(params.get('garage_item_id'));

  if (!garageItemId) {
    const { data, error } = await admin
      .from('garage_items')
      .select('garage_item_id,regnr,vin,model,planned_station,supplier,order_reference,source_kind,garage_direction,handed_off_nybil_id,handed_off_at,updated_at')
      .eq('garage_direction', 'IN')
      .not('regnr', 'is', null)
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('[garage/nybil-handoff] list failed', error);
      return NextResponse.json({ error: 'Kunde inte läsa Garage → Ny bil' }, { status: 500 });
    }
    return NextResponse.json({ data: data ?? [] });
  }

  const { data: item, error } = await admin
    .from('garage_items')
    .select('garage_item_id,regnr,vin,model,planned_station,supplier,order_reference,source_kind,garage_direction,handed_off_nybil_id,handed_off_at')
    .eq('garage_item_id', garageItemId)
    .maybeSingle();

  if (error) {
    console.error('[garage/nybil-handoff] item lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa Garage-objektet' }, { status: 500 });
  }
  if (!item) return NextResponse.json({ error: 'Garage-objektet finns inte' }, { status: 404 });
  if (item.garage_direction !== 'IN') {
    return NextResponse.json({ error: 'Endast UTVECKLA / IN kan överlämnas till Ny bil' }, { status: 409 });
  }
  if (!item.regnr) {
    return NextResponse.json({ error: 'Registreringsnummer krävs före överlämning till Ny bil' }, { status: 409 });
  }
  if (item.handed_off_nybil_id) {
    return NextResponse.json({
      error: 'Garage-objektet är redan överlämnat till Ny bil',
      handed_off_nybil_id: item.handed_off_nybil_id,
      handed_off_at: item.handed_off_at,
    }, { status: 409 });
  }

  let stationDisplayName: string | null = null;
  if (item.planned_station) {
    const { data: station, error: stationError } = await admin
      .from('planning_stations')
      .select('display_name')
      .eq('station_code', item.planned_station)
      .maybeSingle();
    if (stationError) console.error('[garage/nybil-handoff] station lookup failed', stationError);
    stationDisplayName = station?.display_name ?? null;
  }

  return NextResponse.json({
    data: {
      ...item,
      station_display_name: stationDisplayName,
    },
  });
}
