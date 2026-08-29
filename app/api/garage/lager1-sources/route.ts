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

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function upper(value: unknown): string | null {
  const next = text(value);
  return next ? next.toUpperCase().replace(/\s+/g, '') : null;
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

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 });
  }

  const periodId = text(body.period_id);
  const direction = upper(body.garage_direction);
  const plannedStation = text(body.planned_station);
  if (!periodId || !direction || !DIRECTIONS.has(direction) || !plannedStation) {
    return NextResponse.json({ error: 'period_id, riktning och station krävs' }, { status: 400 });
  }

  const admin = adminClient();
  const [periodResponse, stationResponse] = await Promise.all([
    admin
      .from('vehicle_journey_periods')
      .select('period_id,regnr,period_type,started_at,reason_code,reason_text,source_event_id')
      .eq('period_id', periodId)
      .is('ended_at', null)
      .maybeSingle(),
    admin
      .from('planning_stations')
      .select('station_code')
      .eq('station_code', plannedStation)
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  if (periodResponse.error) {
    console.error('[garage/lager1-sources] period lookup failed', periodResponse.error);
    return NextResponse.json({ error: 'Kunde inte läsa Lager 1-perioden' }, { status: 500 });
  }
  if (!periodResponse.data) return NextResponse.json({ error: 'Lager 1-perioden är inte längre öppen' }, { status: 409 });
  if (stationResponse.error) {
    console.error('[garage/lager1-sources] station lookup failed', stationResponse.error);
    return NextResponse.json({ error: 'Kunde inte verifiera station' }, { status: 500 });
  }
  if (!stationResponse.data) return NextResponse.json({ error: 'Ogiltig station' }, { status: 400 });

  const period = periodResponse.data;
  const regnr = upper(period.regnr);
  if (!regnr) return NextResponse.json({ error: 'Lager 1-perioden saknar regnr' }, { status: 409 });

  const [existingResponse, vehicleResponse, nybilResponse] = await Promise.all([
    admin
      .from('garage_items')
      .select('garage_item_id')
      .eq('source_kind', 'LAGER1')
      .eq('source_journey_period_id', period.period_id)
      .is('voided_at', null)
      .maybeSingle(),
    admin.from('vehicles').select('brand,model').eq('regnr', regnr).maybeSingle(),
    admin
      .from('nybil_inventering')
      .select('bilmarke,modell')
      .eq('regnr', regnr)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (existingResponse.error || vehicleResponse.error || nybilResponse.error) {
    console.error('[garage/lager1-sources] identity lookup failed', existingResponse.error ?? vehicleResponse.error ?? nybilResponse.error);
    return NextResponse.json({ error: 'Kunde inte verifiera fordonsidentiteten' }, { status: 500 });
  }
  if (existingResponse.data) {
    return NextResponse.json({ error: 'Den här Lager 1-perioden finns redan i Garaget', garage_item_id: existingResponse.data.garage_item_id }, { status: 409 });
  }

  const model = text(nybilResponse.data?.modell) ?? text(vehicleResponse.data?.model);
  if (!model) {
    return NextResponse.json({ error: `Modell saknas för ${regnr}; komplettera fordonsinformationen innan bilen läggs i Garaget` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const month = now.slice(0, 7);
  const payload = {
    planning_period: month,
    model,
    garage_direction: direction,
    planning_reason: 'ANNAT',
    regnr,
    source_regnr: regnr,
    planned_station: plannedStation,
    confirmation_status: 'PLANERAD',
    transport_status: 'EJ_BOKAD',
    source_kind: 'LAGER1',
    source_journey_period_id: period.period_id,
    source_journey_event_id: period.source_event_id,
    created_at: now,
    updated_at: now,
    created_by: verification.user.id,
    updated_by: verification.user.id,
  };

  const { data, error } = await admin.from('garage_items').insert(payload).select('*').single();
  if (error) {
    console.error('[garage/lager1-sources] Garage insert failed', error);
    if (error.code === '23505') return NextResponse.json({ error: 'Den här Lager 1-perioden finns redan i Garaget' }, { status: 409 });
    return NextResponse.json({ error: 'Kunde inte lägga bilen i Garaget' }, { status: 500 });
  }

  const { error: auditError } = await admin.from('garage_direction_events').insert({
    garage_item_id: data.garage_item_id,
    from_direction: null,
    to_direction: direction,
    reason: `Lager 1 → Garage från ${period.period_type}`,
    changed_at: now,
    changed_by: verification.user.id,
  });
  if (auditError) console.error('[garage/lager1-sources] initial direction audit failed', auditError);

  return NextResponse.json({ data }, { status: 201 });
}
