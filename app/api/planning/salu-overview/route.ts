import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { HUVUDSTATIONER } from '@/lib/constants';
import { verifyApiUser } from '@/lib/server-auth';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const HORIZON_MONTHS = 4;
const SALU_MARGIN_DAYS = 7;

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
type PlanningOrderRow = { period_code: string; model_code: string | null; model: string; ordered_count: number | null };
type PlanningModelRow = { model_code: string; display_name: string; brand: string; aliases: string[] | null };

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

type SaluModelSummary = {
  key: string;
  label: string;
  monthCounts: number[];
  orderedMonthCounts: number[];
  stationCounts: Record<string, number>;
  total: number;
  windowTotal: number;
  orderedTotal: number;
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

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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

function monthIndexFor(period: string, start: Date): number {
  return (Number(period.slice(0, 4)) - start.getUTCFullYear()) * 12 + Number(period.slice(5, 7)) - (start.getUTCMonth() + 1);
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
  const windowStart = addDays(start, -SALU_MARGIN_DAYS);
  const windowEnd = addDays(addMonths(start, 1), SALU_MARGIN_DAYS - 1);
  const endExclusive = addMonths(start, HORIZON_MONTHS);
  const endInclusive = addDays(endExclusive, -1);
  const admin = adminClient();

  const [statesResult, stationsResult, ordersResult, modelRegistryResult] = await Promise.all([
    admin.from('salu_vehicle_state')
      .select('regnr,current_saludatum')
      .gte('current_saludatum', isoDate(windowStart))
      .lte('current_saludatum', isoDate(endInclusive))
      .order('current_saludatum', { ascending: true }),
    admin.from('planning_stations')
      .select('station_code,display_name,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    admin.from('fleet_planning_cells')
      .select('period_code,model_code,model,ordered_count')
      .gte('period_code', period)
      .lt('period_code', periodCode(endExclusive)),
    admin.from('planning_vehicle_models')
      .select('model_code,display_name,brand,aliases')
      .eq('is_active', true),
  ]);

  if (statesResult.error) {
    console.error('[planning salu overview] state lookup failed', statesResult.error);
    return NextResponse.json({ error: 'Kunde inte läsa kommande SALU' }, { status: 500 });
  }
  if (stationsResult.error) {
    console.error('[planning salu overview] station lookup failed', stationsResult.error);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsstationer' }, { status: 500 });
  }
  if (ordersResult.error) {
    console.error('[planning salu overview] BESTÄLLT lookup failed', ordersResult.error);
    return NextResponse.json({ error: 'Kunde inte läsa BESTÄLLT för SALU-översikten' }, { status: 500 });
  }
  if (modelRegistryResult.error) {
    console.error('[planning salu overview] model registry lookup failed', modelRegistryResult.error);
    return NextResponse.json({ error: 'Kunde inte läsa modellregistret för SALU' }, { status: 500 });
  }

  const states = (statesResult.data ?? []) as SaluState[];
  const orderRows = (ordersResult.data ?? []) as PlanningOrderRow[];
  const registry = (modelRegistryResult.data ?? []) as PlanningModelRow[];
  const regnrs = [...new Set(states.map((row) => String(row.regnr).toUpperCase()))];
  const activeStations = new Set((stationsResult.data ?? []).map((row) => String(row.station_code)));

  const canonicalModels = new Map<string, { key: string; label: string; brand: string }>();
  for (const model of registry) {
    const values = [model.model_code, model.display_name, ...(model.aliases ?? [])];
    for (const value of values) {
      const normalized = modelKey(value);
      if (!canonicalModels.has(normalized)) canonicalModels.set(normalized, { key: model.model_code, label: model.display_name, brand: model.brand });
    }
  }

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

  const allItems: SaluItem[] = states.map((state) => {
    const regnr = String(state.regnr).toUpperCase();
    const vehicle = vehicleMap.get(regnr);
    const nybil = nybilMap.get(regnr);
    const checkin = checkinMap.get(regnr);
    const rawModel = clean(nybil?.modell) ?? clean(vehicle?.model) ?? 'Modell saknas';
    const rawBrand = clean(nybil?.bilmarke) ?? clean(vehicle?.brand);
    const canonical = canonicalModels.get(modelKey(rawModel));
    const city = clean(checkin?.current_city) ?? clean(checkin?.city);
    const stationCode = mainStationCode(city, activeStations);
    const month = state.current_saludatum.slice(0, 7);

    return {
      regnr,
      saluDate: state.current_saludatum,
      period: month,
      monthIndex: monthIndexFor(month, start),
      modelKey: canonical?.key ?? modelKey(rawModel),
      model: canonical?.label ?? rawModel,
      brand: canonical?.brand ?? rawBrand,
      stationCode,
      stationName: clean(checkin?.current_station) ?? clean(checkin?.station),
      city,
    };
  });

  const horizonItems = allItems.filter((item) => item.saluDate >= isoDate(start) && item.saluDate <= isoDate(endInclusive));
  const windowItems = allItems.filter((item) => item.saluDate >= isoDate(windowStart) && item.saluDate <= isoDate(windowEnd));
  const orderedByMonth = Array(HORIZON_MONTHS).fill(0) as number[];
  const modelMap = new Map<string, SaluModelSummary>();

  const getSummary = (key: string, label: string): SaluModelSummary => modelMap.get(key) ?? {
    key,
    label,
    monthCounts: Array(HORIZON_MONTHS).fill(0),
    orderedMonthCounts: Array(HORIZON_MONTHS).fill(0),
    stationCounts: {},
    total: 0,
    windowTotal: 0,
    orderedTotal: 0,
  };

  for (const item of horizonItems) {
    if (item.monthIndex < 0 || item.monthIndex >= HORIZON_MONTHS) continue;
    const current = getSummary(item.modelKey, item.model);
    current.monthCounts[item.monthIndex] += 1;
    current.total += 1;
    const station = item.stationCode ?? 'EJ_FASTSTALLD';
    current.stationCounts[station] = (current.stationCounts[station] ?? 0) + 1;
    modelMap.set(item.modelKey, current);
  }

  for (const item of windowItems) {
    const current = getSummary(item.modelKey, item.model);
    current.windowTotal += 1;
    modelMap.set(item.modelKey, current);
  }

  for (const row of orderRows) {
    const rowPeriod = clean(row.period_code);
    const rawModel = clean(row.model);
    const quantity = Number(row.ordered_count ?? 0);
    if (!rowPeriod || !rawModel || !Number.isFinite(quantity) || quantity <= 0) continue;
    const index = monthIndexFor(rowPeriod, start);
    if (index < 0 || index >= HORIZON_MONTHS) continue;
    orderedByMonth[index] += quantity;
    const key = clean(row.model_code) ?? modelKey(rawModel);
    const registryModel = registry.find((model) => model.model_code === key);
    const label = registryModel?.display_name ?? rawModel;
    const current = getSummary(key, label);
    current.orderedMonthCounts[index] += quantity;
    current.orderedTotal += quantity;
    modelMap.set(key, current);
  }

  const monthRows = Array.from({ length: HORIZON_MONTHS }, (_, index) => {
    const month = periodCode(addMonths(start, index));
    const count = horizonItems.filter((item) => item.period === month).length;
    const cumulativeCount = horizonItems.filter((item) => item.monthIndex <= index).length;
    return { index, period: month, label: monthLabel(month), count, cumulativeCount, orderedCount: orderedByMonth[index] };
  });

  const models = [...modelMap.values()].sort((a, b) => b.windowTotal - a.windowTotal || b.total - a.total || b.orderedTotal - a.orderedTotal || a.label.localeCompare(b.label, 'sv'));
  const stationTotals: Record<string, number> = {};
  for (const item of horizonItems) {
    const station = item.stationCode ?? 'EJ_FASTSTALLD';
    stationTotals[station] = (stationTotals[station] ?? 0) + 1;
  }

  return NextResponse.json({
    data: {
      period,
      horizonMonths: HORIZON_MONTHS,
      months: monthRows,
      total: horizonItems.length,
      orderedTotal: orderedByMonth.reduce((sum, value) => sum + value, 0),
      stationTotals,
      planningStations: stationsResult.data ?? [],
      models,
      items: horizonItems,
      saluWindow: {
        start: isoDate(windowStart),
        end: isoDate(windowEnd),
        total: windowItems.length,
        marginDays: SALU_MARGIN_DAYS,
      },
      semantics: 'SALU_STOD_ONLY',
    },
  });
}
