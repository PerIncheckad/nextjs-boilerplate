import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase server configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeRegnr(value: string | null): string {
  return (value || '').toUpperCase().trim().replace(/\s/g, '');
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const regnr = normalizeRegnr(new URL(request.url).searchParams.get('regnr'));
  if (regnr.length < 5) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    const [
      nybilResponse,
      vehicleResponse,
      damagesResponse,
      legacyDamagesResponse,
      checkinsResponse,
      arrivalsResponse,
      vehicleEditsResponse,
    ] = await Promise.all([
      admin
        .from('nybil_inventering')
        .select('*')
        .ilike('regnr', regnr)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.rpc('get_vehicle_by_trimmed_regnr', { p_regnr: regnr }),
      admin
        .from('damages')
        .select('*')
        .eq('regnr', regnr)
        .order('created_at', { ascending: false }),
      admin.rpc('get_damages_by_trimmed_regnr', { p_regnr: regnr }),
      admin
        .from('checkins')
        .select('*')
        .eq('regnr', regnr)
        .order('created_at', { ascending: false }),
      admin
        .from('arrivals')
        .select('*')
        .eq('regnr', regnr)
        .order('created_at', { ascending: false }),
      admin
        .from('vehicle_edits')
        .select('*')
        .eq('regnr', regnr)
        .order('edited_at', { ascending: false }),
    ]);

    const responses = [
      nybilResponse,
      vehicleResponse,
      damagesResponse,
      legacyDamagesResponse,
      checkinsResponse,
      arrivalsResponse,
      vehicleEditsResponse,
    ];
    const failed = responses.find((response) => response.error);
    if (failed?.error) throw failed.error;

    const damages = damagesResponse.data ?? [];
    const checkins = checkinsResponse.data ?? [];
    const damageIds = damages
      .map((damage: { id?: unknown }) => damage.id)
      .filter((id: unknown): id is string => typeof id === 'string');
    const checkinIds = checkins
      .map((checkin: { id?: unknown }) => checkin.id)
      .filter((id: unknown): id is string => typeof id === 'string');

    const [damageCommentsResponse, checkinDamagesResponse] = await Promise.all([
      damageIds.length > 0
        ? admin
            .from('damage_comments')
            .select('*')
            .in('damage_id', damageIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      checkinIds.length > 0
        ? admin
            .from('checkin_damages')
            .select('*')
            .in('checkin_id', checkinIds)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (damageCommentsResponse.error) throw damageCommentsResponse.error;
    if (checkinDamagesResponse.error) throw checkinDamagesResponse.error;

    return NextResponse.json({
      data: {
        nybil: nybilResponse.data ?? null,
        vehicle: vehicleResponse.data ?? [],
        damages,
        legacyDamages: legacyDamagesResponse.data ?? [],
        checkins,
        arrivals: arrivalsResponse.data ?? [],
        vehicleEdits: vehicleEditsResponse.data ?? [],
        damageComments: damageCommentsResponse.data ?? [],
        checkinDamages: checkinDamagesResponse.data ?? [],
      },
    });
  } catch (error) {
    console.error('[status-data] Read failed:', error);
    return NextResponse.json({ error: 'Could not load status data' }, { status: 500 });
  }
}
