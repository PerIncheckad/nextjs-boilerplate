import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import { HUVUDSTATIONER } from '@/lib/constants';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const MAIN_STATIONS = HUVUDSTATIONER.map((station) => station.name);
const PROTECTED_FIELDS = new Set(['returned_at','returnedAt','returned_by','returnedBy','returned_by_email','returnedByEmail','historical_backfill','historicalBackfill','return_type','returnType']);

function cleanRegnr(value: unknown) { return String(value ?? '').toUpperCase().replace(/\s+/g, ''); }
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type StationAccess = { scope: 'SINGLE' | 'ALL'; station: string | null };
async function resolveStationAccess(admin: ReturnType<typeof createAdminClient>, email: string): Promise<StationAccess | null> {
  const { data, error } = await admin.from('employees').select('station,station_scope,is_active').eq('email', email.toLowerCase()).maybeSingle();
  if (error) throw error;
  if (!data?.is_active) return null;
  const scope = data.station_scope === 'ALL' ? 'ALL' : 'SINGLE';
  const station = String(data.station ?? '').trim() || null;
  if (scope === 'SINGLE' && !station) return null;
  return { scope, station };
}

function mapError(message: string) {
  if (/already exists|Open Layer 1/i.test(message)) return 409;
  if (/not found/i.test(message)) return 404;
  if (/Invalid|required|must|cannot/i.test(message)) return 400;
  return 500;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });
  const regnr = cleanRegnr(new URL(request.url).searchParams.get('regnr'));
  if (!REGNR_RE.test(regnr)) return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  let admin; try { admin = createAdminClient(); } catch { return NextResponse.json({ error: 'INHYRD return unavailable' }, { status: 503 }); }
  try {
    const access = await resolveStationAccess(admin, verification.user.email);
    const [intakeRes, returnRes, periodRes, rentalRes] = await Promise.all([
      admin.from('vehicle_rented_in_quick_intakes').select('*').eq('normalized_regnr', regnr).maybeSingle(),
      admin.from('vehicle_rented_in_returns').select('*').eq('normalized_regnr', regnr).maybeSingle(),
      admin.from('vehicle_journey_periods').select('period_id,period_type,started_at,source_entity,source_record_id').eq('regnr', regnr).is('ended_at', null).order('started_at', { ascending: false }),
      admin.from('rental_operational_facts').select('rental_fact_id,agreement_no,out_at,in_at,source_system,source_record_id').eq('regnr', regnr).order('out_at', { ascending: false }).limit(5),
    ]);
    for (const response of [intakeRes, returnRes, periodRes, rentalRes]) if (response.error) return NextResponse.json({ error: 'Failed to load INHYRD return control data' }, { status: 500 });
    return NextResponse.json({ data: {
      regnr,
      intake: intakeRes.data ?? null,
      returnRecord: returnRes.data ?? null,
      openPeriods: periodRes.data ?? [],
      rentalFacts: rentalRes.data ?? [],
      station: access?.station ?? null,
      stationScope: access?.scope ?? null,
      allowedStations: access?.scope === 'ALL' ? MAIN_STATIONS : [],
    }});
  } catch (error) {
    console.error('[rented-in-return] Preflight failed:', error);
    return NextResponse.json({ error: 'Failed to load INHYRD return control data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const protectedField = Object.keys(body).find((key) => PROTECTED_FIELDS.has(key));
  if (protectedField) return NextResponse.json({ error: `Field ${protectedField} is server-controlled` }, { status: 400 });

  const regnr = cleanRegnr(body.regnr);
  const returnedTo = String(body.returned_to ?? body.returnedTo ?? '').trim();
  const odometerKm = Number(body.odometer_km ?? body.odometerKm);
  const damages = String(body.damages_at_return ?? body.damagesAtReturn ?? '').trim();
  const energyType = String(body.energy_type ?? body.energyType ?? '').trim().toUpperCase();
  const energyLevelRaw = body.energy_level_percent ?? body.energyLevelPercent;
  const energyLevel = energyType === 'NOT_APPLICABLE' ? null : Number(energyLevelRaw);
  const requestedStation = String(body.return_station ?? body.returnStation ?? '').trim();

  if (!REGNR_RE.test(regnr)) return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  if (!returnedTo) return NextResponse.json({ error: 'Returned-to party is required' }, { status: 400 });
  if (!Number.isInteger(odometerKm) || odometerKm < 0) return NextResponse.json({ error: 'Odometer km must be zero or greater' }, { status: 400 });
  if (!damages) return NextResponse.json({ error: 'Damages at return must be explicitly recorded, including none known' }, { status: 400 });
  if (!['FUEL','ELECTRIC','NOT_APPLICABLE'].includes(energyType)) return NextResponse.json({ error: 'Invalid energy type' }, { status: 400 });
  if (energyType !== 'NOT_APPLICABLE' && (!Number.isInteger(energyLevel) || Number(energyLevel) < 0 || Number(energyLevel) > 100)) return NextResponse.json({ error: 'Energy level must be 0-100' }, { status: 400 });

  let admin; try { admin = createAdminClient(); } catch { return NextResponse.json({ error: 'INHYRD return unavailable' }, { status: 503 }); }
  let access: StationAccess | null;
  try { access = await resolveStationAccess(admin, verification.user.email); } catch { return NextResponse.json({ error: 'Failed to resolve station' }, { status: 500 }); }
  if (!access) return NextResponse.json({ error: 'Active employee station access is required for INHYRD return' }, { status: 409 });
  let station: string;
  if (access.scope === 'ALL') {
    if (!requestedStation || !MAIN_STATIONS.includes(requestedStation as typeof MAIN_STATIONS[number])) return NextResponse.json({ error: 'Valid return station is required' }, { status: 400 });
    station = requestedStation;
  } else {
    if (requestedStation) return NextResponse.json({ error: 'Return station is server-controlled for single-station operators' }, { status: 400 });
    station = access.station as string;
  }

  const { data, error } = await admin.rpc('register_rented_in_vehicle_return', {
    p_regnr: regnr,
    p_return_station: station,
    p_returned_to: returnedTo,
    p_odometer_km: odometerKm,
    p_damages_at_return: damages,
    p_energy_type: energyType,
    p_energy_level_percent: energyLevel,
    p_actor_id: verification.user.id,
    p_actor_email: verification.user.email,
  });
  if (error) {
    console.error('[rented-in-return] Registration failed:', error);
    return NextResponse.json({ error: error.message || 'INHYRD return failed' }, { status: mapError(error.message || '') });
  }
  return NextResponse.json({ data }, { status: 201 });
}
