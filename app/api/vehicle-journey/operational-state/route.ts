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

  const [periodsResponse, eventsResponse, legacyResponse, rentedInResponse, rentedInReturnResponse] = await Promise.all([
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
    admin
      .from('vehicle_legacy_current_state_entries')
      .select('entry_id,object_type,verified_at,verified_by_email,evidence_reference,verification_method,historical_backfill')
      .eq('normalized_regnr', regnr)
      .maybeSingle(),
    admin
      .from('vehicle_rented_in_quick_intakes')
      .select('intake_id,object_type,brand,model,odometer_km,known_damages,station,registered_at,registered_by_email,intake_method,historical_backfill')
      .eq('normalized_regnr', regnr)
      .maybeSingle(),
    admin
      .from('vehicle_rented_in_returns')
      .select('return_id,intake_id,return_station,returned_to,odometer_km,damages_at_return,energy_type,energy_level_percent,returned_at,returned_by_email,historical_backfill')
      .eq('normalized_regnr', regnr)
      .maybeSingle(),
  ]);

  if (periodsResponse.error) {
    console.error('[operational-state] Period query failed:', periodsResponse.error);
    return NextResponse.json({ error: 'Failed to load operational period' }, { status: 500 });
  }
  if (eventsResponse.error) {
    console.error('[operational-state] Event query failed:', eventsResponse.error);
    return NextResponse.json({ error: 'Failed to load operational evidence' }, { status: 500 });
  }
  if (legacyResponse.error || rentedInResponse.error || rentedInReturnResponse.error) {
    console.error('[operational-state] Classification query failed:', legacyResponse.error ?? rentedInResponse.error ?? rentedInReturnResponse.error);
    return NextResponse.json({ error: 'Failed to load operational classification' }, { status: 500 });
  }

  const model = buildOperationalReadModel(periodsResponse.data ?? [], eventsResponse.data ?? []);
  const legacy = legacyResponse.data;
  const rentedIn = rentedInResponse.data;
  const rentedInReturn = rentedInReturnResponse.data;

  return NextResponse.json({
    data: {
      regnr,
      ...model,
      ...(legacy ? {
        objectType: 'LEGACY_FLEET',
        objectTypeSource: 'LEGACY_CURRENT_STATE_ENTRY',
        objectTypeSourceRecordId: legacy.entry_id,
        objectTypeVerifiedAt: legacy.verified_at,
        objectTypeVerifiedByEmail: legacy.verified_by_email,
        objectTypeEvidenceReference: legacy.evidence_reference,
        objectTypeVerificationMethod: legacy.verification_method,
        historicalBackfill: legacy.historical_backfill,
      } : rentedIn && !rentedInReturn ? {
        objectType: 'INHYRD',
        objectTypeSource: 'RENTED_IN_QUICK_INTAKE',
        objectTypeSourceRecordId: rentedIn.intake_id,
        objectTypeRegisteredAt: rentedIn.registered_at,
        objectTypeRegisteredByEmail: rentedIn.registered_by_email,
        objectTypeStation: rentedIn.station,
        objectTypeIntakeMethod: rentedIn.intake_method,
        objectTypeIntakeSnapshot: {
          brand: rentedIn.brand,
          model: rentedIn.model,
          odometerKm: rentedIn.odometer_km,
          knownDamages: rentedIn.known_damages,
        },
        historicalBackfill: rentedIn.historical_backfill,
      } : rentedIn && rentedInReturn ? {
        objectType: 'INHYRD_RETURNED',
        objectTypeSource: 'RENTED_IN_RETURN',
        objectTypeSourceRecordId: rentedInReturn.return_id,
        objectTypeRegisteredAt: rentedIn.registered_at,
        objectTypeReturnedAt: rentedInReturn.returned_at,
        objectTypeReturnedByEmail: rentedInReturn.returned_by_email,
        objectTypeReturnStation: rentedInReturn.return_station,
        objectTypeReturnedTo: rentedInReturn.returned_to,
        objectTypeReturnSnapshot: {
          odometerKm: rentedInReturn.odometer_km,
          damagesAtReturn: rentedInReturn.damages_at_return,
          energyType: rentedInReturn.energy_type,
          energyLevelPercent: rentedInReturn.energy_level_percent,
        },
        historicalBackfill: rentedInReturn.historical_backfill,
      } : {}),
    },
  });
}
