import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const ALLOWED_STATES = new Set(['AVAILABLE', 'PREPARATION', 'DOWNTIME']);
const PROTECTED_FIELDS = new Set([
  'verified_at',
  'verifiedAt',
  'verified_by',
  'verifiedBy',
  'verified_by_email',
  'verifiedByEmail',
  'actor_id',
  'actorId',
  'actor_email',
  'actorEmail',
  'object_type',
  'objectType',
  'historical_backfill',
  'historicalBackfill',
]);

function cleanRegnr(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/\s+/g, '');
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapError(message: string) {
  if (/already exists|already has|current Layer 1|appeared during|chronology|not permitted/i.test(message)) {
    return 409;
  }
  if (/Invalid|requires|only permits|must be/i.test(message)) return 400;
  return 500;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const { searchParams } = new URL(request.url);
  const regnr = cleanRegnr(searchParams.get('reg') ?? searchParams.get('regnr'));
  if (!REGNR_RE.test(regnr)) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[legacy-entry] Missing server configuration:', error);
    return NextResponse.json({ error: 'LEGACY verification unavailable' }, { status: 503 });
  }

  const [vehicleResponse, periodResponse, legacyResponse] = await Promise.all([
    admin.from('vehicles').select('regnr,brand,model').ilike('regnr', regnr).limit(1).maybeSingle(),
    admin
      .from('vehicle_journey_periods')
      .select('period_id,regnr,period_type,started_at,reason_code,reason_text,source_system,source_entity,source_record_id')
      .eq('regnr', regnr)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('vehicle_legacy_current_state_entries')
      .select('entry_id,regnr,object_type,current_state,reason_code,reason_text,verification_method,evidence_reference,verified_at,verified_by_email,historical_backfill')
      .eq('normalized_regnr', regnr)
      .maybeSingle(),
  ]);

  for (const response of [vehicleResponse, periodResponse, legacyResponse]) {
    if (response.error) {
      console.error('[legacy-entry] Preflight query failed:', response.error);
      return NextResponse.json({ error: 'Failed to load LEGACY control data' }, { status: 500 });
    }
  }

  return NextResponse.json({
    data: {
      regnr,
      vehicle: vehicleResponse.data ?? null,
      currentPeriod: periodResponse.data ?? null,
      legacyEntry: legacyResponse.data ?? null,
      vehicleCatalogIsOwnershipProof: false,
      historicalBackfill: false,
    },
  });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const protectedField = Object.keys(body).find((key) => PROTECTED_FIELDS.has(key));
  if (protectedField) {
    return NextResponse.json({ error: `Field ${protectedField} is server-controlled` }, { status: 400 });
  }

  const regnr = cleanRegnr(body.regnr);
  const currentState = String(body.current_state ?? body.currentState ?? '').trim().toUpperCase();
  const reasonCode = String(body.reason_code ?? body.reasonCode ?? '').trim().toUpperCase() || null;
  const reasonText = String(body.reason_text ?? body.reasonText ?? '').trim() || null;
  const evidenceReference = String(body.evidence_reference ?? body.evidenceReference ?? '').trim();

  if (!REGNR_RE.test(regnr)) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }
  if (!ALLOWED_STATES.has(currentState)) {
    return NextResponse.json({ error: 'LEGACY v1 only permits AVAILABLE, PREPARATION or DOWNTIME' }, { status: 400 });
  }
  if (!evidenceReference) {
    return NextResponse.json({ error: 'Evidence reference is required' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[legacy-entry] Missing server configuration:', error);
    return NextResponse.json({ error: 'LEGACY verification unavailable' }, { status: 503 });
  }

  const vehicleResponse = await admin
    .from('vehicles')
    .select('regnr,brand,model')
    .ilike('regnr', regnr)
    .limit(1)
    .maybeSingle();

  if (vehicleResponse.error) {
    console.error('[legacy-entry] Vehicle control lookup failed:', vehicleResponse.error);
    return NextResponse.json({ error: 'Failed to load vehicle control data' }, { status: 500 });
  }

  const identitySnapshot = {
    requestedRegnr: regnr,
    vehicleCatalogObservation: vehicleResponse.data ?? null,
    vehicleCatalogIsOwnershipProof: false,
  };

  const { data, error } = await admin.rpc('establish_legacy_fleet_current_state', {
    p_regnr: regnr,
    p_current_state: currentState,
    p_reason_code: currentState === 'DOWNTIME' ? reasonCode : null,
    p_reason_text: currentState === 'DOWNTIME' ? reasonText : null,
    p_evidence_reference: evidenceReference,
    p_identity_snapshot: identitySnapshot,
    p_actor_id: verification.user.id,
    p_actor_email: verification.user.email,
  });

  if (error) {
    console.error('[legacy-entry] Establish current state failed:', error);
    return NextResponse.json({ error: error.message || 'LEGACY verification failed' }, { status: mapError(error.message || '') });
  }

  return NextResponse.json({ data }, { status: 201 });
}
