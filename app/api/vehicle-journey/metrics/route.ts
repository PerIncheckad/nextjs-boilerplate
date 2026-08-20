import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import { computeJourneyLifecycleMetrics } from '@/lib/vehicle-journey-metrics';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;

type QueryError = { message?: string } | null;

function cleanRegnr(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function firstError(errors: Array<[string, QueryError]>): string | null {
  for (const [label, error] of errors) {
    if (error) {
      console.error(`[vehicle-journey-metrics] ${label} query failed:`, error);
      return label;
    }
  }
  return null;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const { searchParams } = new URL(request.url);
  const regnr = cleanRegnr(searchParams.get('reg') ?? searchParams.get('regnr') ?? '');
  if (!REGNR_RE.test(regnr)) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[vehicle-journey-metrics] Missing server configuration:', error);
    return NextResponse.json({ error: 'Vehicle journey unavailable' }, { status: 503 });
  }

  const [periodsResponse, nybilResponse, vehicleResponse, saluResponse] = await Promise.all([
    admin
      .from('vehicle_journey_periods')
      .select('period_type,started_at,ended_at,reason_code')
      .eq('regnr', regnr)
      .order('started_at', { ascending: true }),
    admin
      .from('nybil_inventering')
      .select('registreringsdatum,created_at,saludatum,saludatum_planerat,sold_date')
      .eq('regnr', regnr)
      .order('created_at', { ascending: false })
      .limit(1),
    admin
      .from('vehicles')
      .select('datum_ankomst_mabi,sold_date')
      .eq('regnr', regnr)
      .limit(1),
    admin
      .from('salu_vehicle_state')
      .select('ny_date,current_saludatum,final_closed_at')
      .eq('regnr', regnr)
      .limit(1),
  ]);

  const failedSource = firstError([
    ['periods', periodsResponse.error],
    ['nybil', nybilResponse.error],
    ['vehicle', vehicleResponse.error],
    ['SALU', saluResponse.error],
  ]);
  if (failedSource) {
    return NextResponse.json({ error: `Failed to load ${failedSource}` }, { status: 500 });
  }

  const nybil = nybilResponse.data?.[0] ?? null;
  const vehicle = vehicleResponse.data?.[0] ?? null;
  const salu = saluResponse.data?.[0] ?? null;

  const lifecycleStartAt = salu?.ny_date
    ?? nybil?.registreringsdatum
    ?? vehicle?.datum_ankomst_mabi
    ?? nybil?.created_at
    ?? null;
  const lifecycleEndAt = vehicle?.sold_date
    ?? nybil?.sold_date
    ?? salu?.final_closed_at
    ?? null;
  const saluAt = salu?.current_saludatum
    ?? nybil?.saludatum
    ?? nybil?.saludatum_planerat
    ?? null;

  const metrics = computeJourneyLifecycleMetrics({
    periods: periodsResponse.data ?? [],
    lifecycleStartAt,
    lifecycleEndAt,
    saluAt,
  });

  return NextResponse.json({
    data: {
      regnr,
      metrics,
      coverage: {
        periodCount: periodsResponse.data?.length ?? 0,
        hasLifecycleStart: Boolean(lifecycleStartAt),
        hasLifecycleEnd: Boolean(lifecycleEndAt),
        hasSaluDate: Boolean(saluAt),
      },
    },
  });
}
