import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { HUVUDSTATIONER } from '@/lib/constants';
import { verifyApiUser } from '@/lib/server-auth';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const HORIZON_MONTHS = 4;

type SaluState = { regnr: string; current_saludatum: string };
type VehicleRow = { regnr: string; brand: string | null; model: string | null };
type NybilRow = { regnr: string; bilmarke: string | null; modell: string | null; updated_at: string | null };
type CheckinRow = {
  regnr: string;
  current_city: string | null;
  city: string | null;
  current_station: string | null;
  station: string | null;
  completed_at: string | null;
};

type SaluItem = {
  regnr: string;
  saluDate: string;
  period: string;
  monthIndex: number;
  modelKey: string;
  model: string;
  brand: string | null;
  stationCode: string | null;
  stationName: string | null;
  city: string | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function monthStart(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function periodCode(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function monthLabel(period: string): string {
  const date = monthStart(period);
  return new Intl.DateTimeFormat('sv-SE', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function modelKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9ÅÄÖ+]/g, '') || 'MODELL_SAKNAS';
}

function mainStationCode(city: string | null, activeStations: Set<string>): string | null {
  if (!city) return null;
  const match = HUVUDSTATIONER.find((station) => station.name.toLocaleLowerCase('sv') === city.toLocaleLowerCase('sv'));
  if (!match) return null;
  const code = String(match.id);
  return activeStations.has(code) ? code : null;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const url = new URL(request.url);
  const period = url.searchParams.get('period')?.trim() || new Date().toISOString().slice(0, 7);
  if (!PERIOD_RE.test(period)) return NextResponse.json({ error: 'Planeringsperiod måste vara YYYY-MM' }, { status: 400 });

  const start = monthStart(period);
  const endExclusive = addMonths(start, HORIZON_MONTHS);
  const endInclusive = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
  const admin = adminClient();

  const [statesResult, stationsResult] = await Promise.all([
    admin.from('salu_vehicle_state')
      .select('regnr,current_saludatum')
      .gte('current_saludatum', isoDate(start))
      .lte('current_saludatum', isoDate(endInclusive))
      .order('current_saludatum', { ascending: true }),
    admin.from('planning_stations')
      .select('station_code,display_name,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);

  if (statesResult.error) {
    console.error('[planning salu overview] state lookup failed', statesResult.error);
    return NextResponse.json({ error: 'Kunde inte läsa kommande SALU' }, { status: 500 });
  }
  if (stationsResult.error) {
    console.error('[planning salu overview] station lookup failed', stationsResult.error);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsstationer' }, { status: 500 });
  }

  const states = (statesResult.data ?? []) as SaluState[];
  const regnrs = [...new Set(states.map((row) => String(row.regnr).toUpperCase()))];
  const activeStations = new Set((stationsResult.data ?? []).map((row) => String(row.station_code)));

  const vehicleMap = new Map<string, VehicleRow>();
  const nybilMap = new Map<string, NybilRow>();
  const checkinMap = new Map<string, CheckinRow>();

  if (regnrs.length > 0) {
    const [vehiclesResult, nybilResult, checkinsResult] = await Promise.all([
      admin.from('vehicles').select('regnr,brand,model').in('regnr', regnrs),
      admin.from('nybil_inventering').select('regnr,bilmarke,modell,updated_at').in('regnr', regnrs).order('updated_at', { ascending: false }),
      admin.from('checkins').select('regnr,current_city,city,current_station,station,completed_at').in('regnr', regnrs).not('completed_at', 'is', null).order('completed_at', { ascending: false }),
    ]);

    if (vehiclesResult.error || nybilResult.error || checkinsResult.error) {
      console.error('[planning salu overview] vehicle enrichment failed', {
        vehicles: vehiclesResult.error,
        nybil: nybilResult.error,
        checkins: checkinsResult.error,
      });
      return NextResponse.json({ error: 'Kunde inte läsa fordonsinformationen för SALU' }, { status: 500 });
    }

    for (const row of (vehiclesResult.data ?? []) as VehicleRow[]) vehicleMap.set(String(row.regnr).toUpperCase(), row);
    for (const row of (nybilResult.data ?? []) as NybilRow[]) {
      const regnr = String(row.regnr).toUpperCase();
      if (!nybilMap.has(regnr)) nybilMap.set(regnr, row);
    }
    for (const row of (checkinsResult.data ?? []) as CheckinRow[]) {
      const regnr = String(row.regnr).toUpperCase();
      if (!checkinMap.has(regnr)) checkinMap.set(regnr, row);
    }
  }

  const items: SaluItem[] = states.map((state) => {
    const regnr = String(state.regnr).toUpperCase();
    const vehicle = vehicleMap.get(regnr);
    const nybil = nybilMap.get(regnr);
    const checkin = checkinMap.get(regnr);
    const rawModel = clean(nybil?.modell) ?? clean(vehicle?.model) ?? 'Modell saknas';
    const brand = clean(nybil?.bilmarke) ?? clean(vehicle?.brand);
    const city = clean(checkin?.current_city) ?? clean(checkin?.city);
    const stationCode = mainStationCode(city, activeStations);
    const month = state.current_saludatum.slice(0, 7);
    const monthIndex = Math.max(0, Math.min(HORIZON_MONTHS - 1,
      (Number(month.slice(0, 4)) - start.getUTCFullYear()) * 12 + Number(month.slice(5, 7)) - (start.getUTCMonth() + 1),
    ));

    return {
      regnr,
      saluDate: state.current_saludatum,
      period: month,
      monthIndex,
      modelKey: modelKey(rawModel),
      model: rawModel,
      brand,
      stationCode,
      stationName: clean(checkin?.current_station) ?? clean(checkin?.station),
      city,
    };
  });

  const monthRows = Array.from({ length: HORIZON_MONTHS }, (_, index) => {
    const month = periodCode(addMonths(start, index));
    const count = items.filter((item) => item.period === month).length;
    const cumulativeCount = items.filter((item) => item.monthIndex <= index).length;
    return { index, period: month, label: monthLabel(month), count, cumulativeCount };
  });

  const modelMap = new Map<string, { key: string; label: string; monthCounts: number[]; stationCounts: Record<string, number>; total: number }>();
  for (const item of items) {
    const current = modelMap.get(item.modelKey) ?? {
      key: item.modelKey,
      label: item.model,
      monthCounts: Array(HORIZON_MONTHS).fill(0),
      stationCounts: {},
      total: 0,
    };
    current.monthCounts[item.monthIndex] += 1;
    current.total += 1;
    const station = item.stationCode ?? 'EJ_FASTSTALLD';
    current.stationCounts[station] = (current.stationCounts[station] ?? 0) + 1;
    modelMap.set(item.modelKey, current);
  }

  const models = [...modelMap.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'sv'));
  const stationTotals: Record<string, number> = {};
  for (const item of items) {
    const station = item.stationCode ?? 'EJ_FASTSTALLD';
    stationTotals[station] = (stationTotals[station] ?? 0) + 1;
  }

  return NextResponse.json({
    data: {
      period,
      horizonMonths: HORIZON_MONTHS,
      months: monthRows,
      total: items.length,
      stationTotals,
      planningStations: stationsResult.data ?? [],
      models,
      items,
      semantics: 'SALU_STOD_ONLY',
    },
  });
}
