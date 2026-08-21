import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import { buildOperationalReadModel } from '@/lib/vehicle-operational-read-model';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;

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

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[operational-state] Missing server configuration:', error);
    return NextResponse.json({ error: 'Operational state unavailable' }, { status: 503 });
  }

  const [periodsResponse, eventsResponse] = await Promise.all([
    admin
      .from('vehicle_journey_periods')
      .select('period_id,period_type,started_at,ended_at,reason_code,reason_text,source_system,source_entity,source_record_id')
      .eq('regnr', regnr)
      .is('ended_at', null)
      .order('started_at', { ascending: false }),
    admin
      .from('vehicle_journey_events')
      .select('event_id,event_type,occurred_at,source_system,source_entity,source_record_id,correction_of_event_id,payload')
      .eq('regnr', regnr)
      .in('event_type', ['DOWNTIME_CONFIRMED', 'VEHICLE_SOLD_RECORDED', 'VEHICLE_SOLD_CORRECTED'])
      .order('occurred_at', { ascending: false }),
  ]);

  if (periodsResponse.error) {
    console.error('[operational-state] Period query failed:', periodsResponse.error);
    return NextResponse.json({ error: 'Failed to load operational period' }, { status: 500 });
  }
  if (eventsResponse.error) {
    console.error('[operational-state] Event query failed:', eventsResponse.error);
    return NextResponse.json({ error: 'Failed to load operational evidence' }, { status: 500 });
  }

  const model = buildOperationalReadModel(periodsResponse.data ?? [], eventsResponse.data ?? []);

  return NextResponse.json({
    data: {
      regnr,
      ...model,
    },
  });
}
