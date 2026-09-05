import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function mapError(message: string) {
  if (/finns inte/i.test(message)) return 404;
  if (/krävs|måste|aktiv huvudstation|saknar modell/i.test(message)) return 400;
  if (/redan|stoppat|föregår/i.test(message)) return 409;
  return 500;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const entryId = text(new URL(request.url).searchParams.get('legacy_entry_id'));
  if (!entryId) return NextResponse.json({ error: 'legacy_entry_id saknas' }, { status: 400 });

  const admin = adminClient();
  const [legacyResponse, stationResponse, handoffResponse] = await Promise.all([
    admin
      .from('vehicle_legacy_current_state_entries')
      .select('entry_id,regnr,normalized_regnr,object_type,current_state,evidence_reference,identity_snapshot,verified_at,verified_by_email,historical_backfill')
      .eq('entry_id', entryId)
      .maybeSingle(),
    admin
      .from('planning_stations')
      .select('station_code,display_name,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('station_code', { ascending: true }),
    admin
      .from('garage_legacy_handoffs')
      .select('handoff_id,legacy_entry_id,garage_item_id,journey_period_id,regnr,planned_station,occurred_at,actor_email,historical_backfill')
      .eq('legacy_entry_id', entryId)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  for (const response of [legacyResponse, stationResponse, handoffResponse]) {
    if (response.error) {
      console.error('[garage/legacy-ut-handoff] preflight failed', response.error);
      return NextResponse.json({ error: 'Kunde inte läsa LEGACY → Garage-kontrollbild' }, { status: 500 });
    }
  }

  if (!legacyResponse.data) return NextResponse.json({ error: 'LEGACY-entryn finns inte' }, { status: 404 });

  const periodResponse = await admin
    .from('vehicle_journey_periods')
    .select('period_id,period_type,started_at,source_entity,source_record_id')
    .eq('regnr', legacyResponse.data.normalized_regnr)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (periodResponse.error) {
    console.error('[garage/legacy-ut-handoff] period failed', periodResponse.error);
    return NextResponse.json({ error: 'Kunde inte läsa aktuell Layer 1-period' }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      legacyEntry: legacyResponse.data,
      currentPeriod: periodResponse.data ?? null,
      existingHandoff: handoffResponse.data ?? null,
      stations: stationResponse.data ?? [],
      historicalBackfill: false,
    },
  });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 });
  }

  const legacyEntryId = text(body.legacy_entry_id ?? body.legacyEntryId);
  const station = text(body.planned_station ?? body.plannedStation);
  if (!legacyEntryId) return NextResponse.json({ error: 'legacy_entry_id saknas' }, { status: 400 });
  if (!station) return NextResponse.json({ error: 'Aktuell station måste väljas' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin.rpc('materialize_legacy_fleet_to_garage_ut', {
    p_legacy_entry_id: legacyEntryId,
    p_planned_station: station,
    p_actor_id: verification.user.id,
    p_actor_email: verification.user.email,
  });

  if (error) {
    console.error('[garage/legacy-ut-handoff] materialize failed', error);
    return NextResponse.json({ error: error.message || 'LEGACY → Garage-handslag misslyckades' }, { status: mapError(error.message || '') });
  }

  return NextResponse.json({ data }, { status: 201 });
}
