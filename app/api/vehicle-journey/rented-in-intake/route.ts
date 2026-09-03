import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import { HUVUDSTATIONER } from '@/lib/constants';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const ALLOWED_STATIONS = new Set(HUVUDSTATIONER.map((station) => station.name));
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

async function resolveStationScope(admin: ReturnType<typeof createAdminClient>, email: string) {
  const { data, error } = await admin
    .from('employees')
    .select('station,is_active')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data?.is_active || !String(data.station ?? '').trim()) return null;
  return String(data.station).trim();
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
    const stationScope = await resolveStationScope(admin, verification.user.email);
    const [intakeResponse, legacyResponse, periodResponse] = await Promise.all([
      admin.from('vehicle_rented_in_quick_intakes').select('*').eq('normalized_regnr', regnr).maybeSingle(),
      admin.from('vehicle_legacy_current_state_entries').select('entry_id,object_type').eq('normalized_regnr', regnr).maybeSingle(),
      admin.from('vehicle_journey_periods').select('period_id,period_type,started_at').eq('regnr', regnr).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const response of [intakeResponse, legacyResponse, periodResponse]) {
      if (response.error) return NextResponse.json({ error: 'Failed to load INHYRD control data' }, { status: 500 });
    }
    return NextResponse.json({ data: {
      regnr,
      station: stationScope && stationScope !== 'ALLA' ? stationScope : null,
      stationScope,
      availableStations: stationScope === 'ALLA' ? HUVUDSTATIONER.map((station) => station.name) : [],
      intake: intakeResponse.data ?? null,
      legacy: legacyResponse.data ?? null,
      currentPeriod: periodResponse.data ?? null,
      historicalBackfill: false,
    } });
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

  let stationScope: string | null;
  try { stationScope = await resolveStationScope(admin, verification.user.email); } catch (error) {
    console.error('[rented-in-intake] Station lookup failed:', error);
    return NextResponse.json({ error: 'Failed to resolve station' }, { status: 500 });
  }
  if (!stationScope) return NextResponse.json({ error: 'Active employee station scope is required for INHYRD quick intake' }, { status: 409 });

  let station: string;
  if (stationScope === 'ALLA') {
    if (!requestedIntakeStation || !ALLOWED_STATIONS.has(requestedIntakeStation)) {
      return NextResponse.json({ error: 'Valid intake station is required for ALLA station scope' }, { status: 400 });
    }
    station = requestedIntakeStation;
  } else {
    if (requestedIntakeStation) return NextResponse.json({ error: 'Intake station is server-controlled for single-station users' }, { status: 400 });
    if (!ALLOWED_STATIONS.has(stationScope)) return NextResponse.json({ error: 'Employee station is not a valid main station' }, { status: 409 });
    station = stationScope;
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
