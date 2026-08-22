import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
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

  const url = new URL(request.url);
  const regnr = normalizeRegnr(url.searchParams.get('regnr'));
  if (regnr.length < 5) return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });

  try {
    const admin = createAdminClient();
    const registrationDate = url.searchParams.get('registrationDate');

    const [vehicleResponse, nybilResponse, sameDayResponse] = await Promise.all([
      admin
        .from('vehicles')
        .select('regnr, brand, model')
        .ilike('regnr', regnr)
        .maybeSingle(),
      admin
        .from('nybil_inventering')
        .select('id, regnr, registreringsdatum, bilmarke, modell, duplicate_group_id, created_at, fullstandigt_namn')
        .ilike('regnr', regnr)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      registrationDate
        ? admin
            .from('nybil_inventering')
            .select('id', { count: 'exact', head: true })
            .eq('regnr', regnr)
            .eq('registreringsdatum', registrationDate)
        : Promise.resolve({ count: 0, error: null }),
    ]);

    if (vehicleResponse.error) throw vehicleResponse.error;
    if (nybilResponse.error) throw nybilResponse.error;
    if (sameDayResponse.error) throw sameDayResponse.error;

    const previousRegistration = nybilResponse.data
      ? { ...nybilResponse.data, id: String(nybilResponse.data.id) }
      : null;

    return NextResponse.json({
      data: {
        existsInBilkontroll: !!vehicleResponse.data,
        existsInNybil: !!nybilResponse.data,
        previousRegistration,
        vehicleInfo: vehicleResponse.data
          ? { bilmarke: vehicleResponse.data.brand ?? undefined, modell: vehicleResponse.data.model ?? undefined }
          : null,
        sameDayCount: sameDayResponse.count ?? 0,
      },
    });
  } catch (error) {
    console.error('[api/nybil] GET failed:', error);
    return NextResponse.json({ error: 'Could not load Nybil data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  try {
    const body = await request.json() as { inventoryData?: Record<string, unknown> };
    if (!body.inventoryData || typeof body.inventoryData !== 'object') {
      return NextResponse.json({ error: 'Missing inventoryData' }, { status: 400 });
    }

    const admin = createAdminClient();
    const response = await admin
      .from('nybil_inventering')
      .insert([body.inventoryData])
      .select('id')
      .single();
    if (response.error) throw response.error;

    return NextResponse.json({ data: { id: response.data?.id ?? null } });
  } catch (error) {
    console.error('[api/nybil] POST failed:', error);
    return NextResponse.json({ error: 'Could not save Nybil registration' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  try {
    const body = await request.json() as { id?: string | number; duplicateGroupId?: string };
    if (body.id === undefined || !body.duplicateGroupId) {
      return NextResponse.json({ error: 'Missing duplicate group update data' }, { status: 400 });
    }

    const admin = createAdminClient();
    const response = await admin
      .from('nybil_inventering')
      .update({ duplicate_group_id: body.duplicateGroupId })
      .eq('id', body.id);
    if (response.error) throw response.error;

    return NextResponse.json({ data: { updated: true } });
  } catch (error) {
    console.error('[api/nybil] PATCH failed:', error);
    return NextResponse.json({ error: 'Could not update Nybil duplicate group' }, { status: 500 });
  }
}
