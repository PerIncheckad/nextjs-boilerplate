import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = adminClient();
  const [periodResponse, importedResponse, stationResponse] = await Promise.all([
    admin
      .from('vehicle_journey_periods')
      .select('period_id,regnr,period_type,started_at,reason_code,reason_text,source_event_id')
      .is('ended_at', null)
      .order('started_at', { ascending: false }),
    admin
      .from('garage_items')
      .select('garage_item_id,source_journey_period_id')
      .eq('source_kind', 'LAGER1')
      .is('voided_at', null),
    admin
      .from('planning_stations')
      .select('station_code,display_name,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('station_code', { ascending: true }),
  ]);

  if (periodResponse.error) {
    console.error('[garage/lager1-sources] periods failed', periodResponse.error);
    return NextResponse.json({ error: 'Kunde inte läsa Lager 1' }, { status: 500 });
  }
  if (importedResponse.error) {
    console.error('[garage/lager1-sources] Garage lookup failed', importedResponse.error);
    return NextResponse.json({ error: 'Kunde inte läsa Garage-kopplingar' }, { status: 500 });
  }
  if (stationResponse.error) {
    console.error('[garage/lager1-sources] stations failed', stationResponse.error);
    return NextResponse.json({ error: 'Kunde inte läsa stationer' }, { status: 500 });
  }

  const periods = periodResponse.data ?? [];
  const regnrs = [...new Set(periods.map((row) => row.regnr).filter(Boolean))];
  const imported = new Map((importedResponse.data ?? []).map((row) => [row.source_journey_period_id, row.garage_item_id]));

  let vehicleRows: Array<{ regnr: string; brand: string | null; model: string | null }> = [];
  let nybilRows: Array<{ regnr: string; bilmarke: string | null; modell: string | null; created_at: string }> = [];

  if (regnrs.length > 0) {
    const [vehicleResponse, nybilResponse] = await Promise.all([
      admin.from('vehicles').select('regnr,brand,model').in('regnr', regnrs),
      admin.from('nybil_inventering').select('regnr,bilmarke,modell,created_at').in('regnr', regnrs).order('created_at', { ascending: false }),
    ]);
    if (vehicleResponse.error) {
      console.error('[garage/lager1-sources] vehicles failed', vehicleResponse.error);
      return NextResponse.json({ error: 'Kunde inte läsa fordonsregister' }, { status: 500 });
    }
    if (nybilResponse.error) {
      console.error('[garage/lager1-sources] Nybil lookup failed', nybilResponse.error);
      return NextResponse.json({ error: 'Kunde inte läsa Ny bil-baslinjer' }, { status: 500 });
    }
    vehicleRows = vehicleResponse.data ?? [];
    nybilRows = nybilResponse.data ?? [];
  }

  const vehicleByReg = new Map(vehicleRows.map((row) => [row.regnr, row]));
  const nybilByReg = new Map<string, (typeof nybilRows)[number]>();
  for (const row of nybilRows) if (!nybilByReg.has(row.regnr)) nybilByReg.set(row.regnr, row);

  return NextResponse.json({
    data: periods.map((period) => {
      const vehicle = vehicleByReg.get(period.regnr);
      const nybil = nybilByReg.get(period.regnr);
      return {
        ...period,
        brand: nybil?.bilmarke ?? vehicle?.brand ?? null,
        model: nybil?.modell ?? vehicle?.model ?? null,
        imported: imported.has(period.period_id),
        garage_item_id: imported.get(period.period_id) ?? null,
      };
    }),
    stations: stationResponse.data ?? [],
  });
}
