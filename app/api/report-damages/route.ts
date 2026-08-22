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

function mapOrtToRegion(ort: string | null | undefined): string {
  if (!ort) return '--';
  const normalized = ort.toLowerCase();
  if (['halmstad', 'varberg', 'falkenberg'].includes(normalized)) return 'Norr';
  if (['helsingborg', 'ängelholm'].includes(normalized)) return 'Mitt';
  if (['malmö', 'trelleborg', 'lund'].includes(normalized)) return 'Syd';
  return '--';
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  try {
    const admin = createAdminClient();
    const damageId = new URL(request.url).searchParams.get('damageId');

    if (damageId) {
      const { data, error } = await admin
        .from('damage_media')
        .select('url,type,comment')
        .eq('damage_id', damageId);

      if (error) throw error;
      return NextResponse.json({ data: data ?? [] });
    }

    const [damagesResponse, vehiclesResponse] = await Promise.all([
      admin.from('damages').select('*').order('created_at', { ascending: false }),
      admin.from('vehicles').select('regnr,brand,model'),
    ]);

    if (damagesResponse.error) throw damagesResponse.error;
    if (vehiclesResponse.error) throw vehiclesResponse.error;

    const vehicles = new Map(
      (vehiclesResponse.data ?? []).map((vehicle) => [vehicle.regnr, vehicle]),
    );

    const rows = (damagesResponse.data ?? []).map((damage) => {
      const vehicle = vehicles.get(damage.regnr);
      return {
        ...damage,
        brand: vehicle?.brand ?? null,
        model: vehicle?.model ?? null,
        region: mapOrtToRegion(damage.ort),
      };
    });

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('[report-damages] Read failed:', error);
    return NextResponse.json({ error: 'Could not load report data' }, { status: 500 });
  }
}
