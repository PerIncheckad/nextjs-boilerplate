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

function regKey(value: string | null): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

type ExistingNybil = {
  id: string;
  created_at: string | null;
  source_garage_item_id: string | null;
};

type ExistingNybilTiming = 'BEFORE_GARAGE' | 'AFTER_GARAGE' | 'UNKNOWN' | null;

function classifyExistingNybilTiming(garageCreatedAt: string | null, nybilCreatedAt: string | null): ExistingNybilTiming {
  if (!nybilCreatedAt) return null;
  if (!garageCreatedAt) return 'UNKNOWN';
  return nybilCreatedAt < garageCreatedAt ? 'BEFORE_GARAGE' : 'AFTER_GARAGE';
}

async function loadExistingNybilByReg(admin: ReturnType<typeof adminClient>, regnrs: string[]) {
  if (regnrs.length === 0) return new Map<string, ExistingNybil>();

  const { data, error } = await admin
    .from('nybil_inventering')
    .select('id,regnr,created_at,source_garage_item_id')
    .in('regnr', regnrs);

  if (error) throw error;

  const result = new Map<string, ExistingNybil>();
  for (const row of data ?? []) {
    const key = regKey(row.regnr);
    const current = result.get(key);
    if (!current || String(row.created_at ?? '') > String(current.created_at ?? '')) {
      result.set(key, {
        id: String(row.id),
        created_at: row.created_at ?? null,
        source_garage_item_id: row.source_garage_item_id ?? null,
      });
    }
  }
  return result;
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
      .select('garage_item_id,regnr,vin,model,planned_station,supplier,order_reference,source_kind,garage_direction,handed_off_nybil_id,handed_off_at,created_at,updated_at')
      .eq('garage_direction', 'IN')
      .is('voided_at', null)
      .not('regnr', 'is', null)
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('[garage/nybil-handoff] list failed', error);
      return NextResponse.json({ error: 'Kunde inte läsa Garage → Ny bil' }, { status: 500 });
    }

    const rows = data ?? [];
    let existingByReg = new Map<string, ExistingNybil>();
    try {
      existingByReg = await loadExistingNybilByReg(admin, [...new Set(rows.map((row) => row.regnr).filter((value): value is string => Boolean(value)))]);
    } catch (lookupError) {
      console.error('[garage/nybil-handoff] Ny bil lookup failed', lookupError);
      return NextResponse.json({ error: 'Kunde inte kontrollera befintliga Ny bil-registreringar' }, { status: 500 });
    }

    return NextResponse.json({
      data: rows.map((row) => {
        const existing = existingByReg.get(regKey(row.regnr));
        return {
          ...row,
          existing_nybil_id: existing?.id ?? null,
          existing_nybil_created_at: existing?.created_at ?? null,
          existing_nybil_source_garage_item_id: existing?.source_garage_item_id ?? null,
          existing_nybil_timing: existing
            ? classifyExistingNybilTiming(row.created_at ?? null, existing.created_at)
            : null,
        };
      }),
    });
  }

  const { data: item, error } = await admin
    .from('garage_items')
    .select('garage_item_id,planning_period,model,planning_reason,supplier,order_reference,regnr,vin,source_regnr,planned_station,saluort,daily_rate,holding_period_months,ordered_at,calloff_at,confirmation_status,transport_status,planned_delivery_date,note,source_kind,source_planning_cell_id,garage_direction,handed_off_nybil_id,handed_off_at,created_at,updated_at')
    .eq('garage_item_id', garageItemId)
    .is('voided_at', null)
    .maybeSingle();

  if (error) {
    console.error('[garage/nybil-handoff] item lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa Garage-objektet' }, { status: 500 });
  }
  if (!item) return NextResponse.json({ error: 'Garage-objektet finns inte eller är makulerat' }, { status: 404 });
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

  try {
    const existingByReg = await loadExistingNybilByReg(admin, [item.regnr]);
    const existing = existingByReg.get(regKey(item.regnr));
    if (existing) {
      return NextResponse.json({
        error: 'Registreringsnumret finns redan i Ny bil och ska inte registreras igen',
        existing_nybil_id: existing.id,
        existing_nybil_created_at: existing.created_at,
        existing_nybil_source_garage_item_id: existing.source_garage_item_id,
        existing_nybil_timing: classifyExistingNybilTiming(item.created_at ?? null, existing.created_at),
      }, { status: 409 });
    }
  } catch (lookupError) {
    console.error('[garage/nybil-handoff] Ny bil lookup failed', lookupError);
    return NextResponse.json({ error: 'Kunde inte kontrollera befintlig Ny bil-registrering' }, { status: 500 });
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

  let modelCode: string | null = null;
  let brand: string | null = null;
  let isElectric: boolean | null = null;
  let isAutomatic: boolean | null = null;
  if (item.source_planning_cell_id) {
    const { data: cell, error: cellError } = await admin
      .from('fleet_planning_cells')
      .select('model_code')
      .eq('planning_cell_id', item.source_planning_cell_id)
      .maybeSingle();
    if (cellError) {
      console.error('[garage/nybil-handoff] planning cell lookup failed', cellError);
    } else if (cell?.model_code) {
      modelCode = cell.model_code;
      const { data: model, error: modelError } = await admin
        .from('planning_vehicle_models')
        .select('brand,is_electric,is_automatic')
        .eq('model_code', cell.model_code)
        .maybeSingle();
      if (modelError) console.error('[garage/nybil-handoff] planning model lookup failed', modelError);
      brand = model?.brand ?? null;
      isElectric = typeof model?.is_electric === 'boolean' ? model.is_electric : null;
      isAutomatic = typeof model?.is_automatic === 'boolean' ? model.is_automatic : null;
    }
  }

  return NextResponse.json({
    data: {
      ...item,
      station_display_name: stationDisplayName,
      model_code: modelCode,
      brand,
      is_electric: isElectric,
      is_automatic: isAutomatic,
    },
  });
}
