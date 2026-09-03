import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import { HUVUDSTATIONER } from '@/lib/constants';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const MAIN_STATIONS = HUVUDSTATIONER.map((station) => station.name);
const PROTECTED_FIELDS = new Set([
  'station', 'object_type', 'objectType', 'registered_at', 'registeredAt',
  'registered_by', 'registeredBy', 'registered_by_email', 'registeredByEmail',
  'historical_backfill', 'historicalBackfill', 'intake_method', 'intakeMethod',
]);

function cleanRegnr(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/\s+/g, '');
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

type StationAccess = {
  scope: 'SINGLE' | 'ALL';
  station: string | null;
};

async function resolveStationAccess(admin: ReturnType<typeof createAdminClient>, email: string): Promise<StationAccess | null> {
  const { data, error } = await admin
    .from('employees')
    .select('station,station_scope,is_active')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data?.is_active) return null;

  const scope = data.station_scope === 'ALL' ? 'ALL' : 'SINGLE';
  const station = String(data.station ?? '').trim() || null;
  if (scope === 'SINGLE' && !station) return null;
  return { scope, station };
}

function mapError(message: string) {
  if (/already exists|already classified/i.test(message)) return 409;
  if (/Invalid|requires|required|must be/i.test(message)) return 400;
  return 500;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const regnr = cleanRegnr(new URL(request.url).searchParams.get('regnr'));
  if (!REGNR_RE.test(regnr)) return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });

  let admin;
  try { admin = createAdminClient(); } catch {
    return NextResponse.json({ error: 'INHYRD quick intake unavailable' }, { status: 503 });
  }

  try {
    const stationAccess = await resolveStationAccess(admin, verification.user.email);
    const [intakeResponse, legacyResponse, periodResponse] = await Promise.all([
      admin.from('vehicle_rented_in_quick_intakes').select('*').eq('normalized_regnr', regnr).maybeSingle(),
      admin.from('vehicle_legacy_current_state_entries').select('entry_id,object_type').eq('normalized_regnr', regnr).maybeSingle(),
      admin.from('vehicle_journey_periods').select('period_id,period_type,started_at').eq('regnr', regnr).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const response of [intakeResponse, legacyResponse, periodResponse]) {
      if (response.error) return NextResponse.json({ error: 'Failed to load INHYRD control data' }, { status: 500 });
    }
    return NextResponse.json({
      data: {
        regnr,
        station: stationAccess?.station ?? null,
        stationScope: stationAccess?.scope ?? null,
        allowedStations: stationAccess?.scope === 'ALL' ? MAIN_STATIONS : [],
        intake: intakeResponse.data ?? null,
        legacy: legacyResponse.data ?? null,
        currentPeriod: periodResponse.data ?? null,
        historicalBackfill: false,
      },
    });
  } catch (error) {
    console.error('[rented-in-intake] Preflight failed:', error);
    return NextResponse.json({ error: 'Failed to load INHYRD control data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const protectedField = Object.keys(body).find((key) => PROTECTED_FIELDS.has(key));
  if (protectedField) return NextResponse.json({ error: `Field ${protectedField} is server-controlled` }, { status: 400 });

  const regnr = cleanRegnr(body.regnr);
  const brand = String(body.brand ?? '').trim();
  const model = String(body.model ?? '').trim();
  const odometerKm = Number(body.odometer_km ?? body.odometerKm);
  const knownDamages = String(body.known_damages ?? body.knownDamages ?? '').trim();
  const requestedIntakeStation = String(body.intake_station ?? body.intakeStation ?? '').trim();

  if (!REGNR_RE.test(regnr)) return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  if (!brand) return NextResponse.json({ error: 'Brand is required' }, { status: 400 });
  if (!model) return NextResponse.json({ error: 'Model is required' }, { status: 400 });
  if (!Number.isInteger(odometerKm) || odometerKm < 0) return NextResponse.json({ error: 'Odometer km must be zero or greater' }, { status: 400 });
  if (!knownDamages) return NextResponse.json({ error: 'Known damages must be explicitly recorded, including none known' }, { status: 400 });

  let admin;
  try { admin = createAdminClient(); } catch {
    return NextResponse.json({ error: 'INHYRD quick intake unavailable' }, { status: 503 });
  }

  let stationAccess: StationAccess | null;
  try { stationAccess = await resolveStationAccess(admin, verification.user.email); } catch (error) {
    console.error('[rented-in-intake] Station lookup failed:', error);
    return NextResponse.json({ error: 'Failed to resolve station' }, { status: 500 });
  }
  if (!stationAccess) return NextResponse.json({ error: 'Active employee station access is required for INHYRD quick intake' }, { status: 409 });

  let station: string;
  if (stationAccess.scope === 'ALL') {
    if (!requestedIntakeStation) return NextResponse.json({ error: 'Intake station is required for ALL-station operators' }, { status: 400 });
    if (!MAIN_STATIONS.includes(requestedIntakeStation as typeof MAIN_STATIONS[number])) {
      return NextResponse.json({ error: 'Invalid intake station' }, { status: 400 });
    }
    station = requestedIntakeStation;
  } else {
    if (requestedIntakeStation) return NextResponse.json({ error: 'Intake station is server-controlled for single-station operators' }, { status: 400 });
    station = stationAccess.station as string;
  }

  const { data, error } = await admin.rpc('register_rented_in_vehicle_quick_intake', {
    p_regnr: regnr,
    p_brand: brand,
    p_model: model,
    p_odometer_km: odometerKm,
    p_known_damages: knownDamages,
    p_station: station,
    p_actor_id: verification.user.id,
    p_actor_email: verification.user.email,
  });

  if (error) {
    console.error('[rented-in-intake] Registration failed:', error);
    return NextResponse.json({ error: error.message || 'INHYRD quick intake failed' }, { status: mapError(error.message || '') });
  }
  return NextResponse.json({ data }, { status: 201 });
}
