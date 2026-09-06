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
    const [wheelResponse, saluResponse, checkinResponse] = await Promise.all([
      admin.rpc('get_current_wheel_fact', { p_regnr: regnr }),
      admin
        .from('salu_vehicle_state')
        .select('regnr,current_saludatum,updated_at')
        .eq('regnr', regnr)
        .maybeSingle(),
      admin
        .from('checkins')
        .select('id,completed_at,created_at,current_city,current_station,city,station,checker_name,checker_email')
        .eq('regnr', regnr)
        .eq('status', 'COMPLETED')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const failed = [wheelResponse, saluResponse, checkinResponse].find((response) => response.error);
    if (failed?.error) throw failed.error;

    return NextResponse.json({
      data: {
        currentWheelFact: wheelResponse.data?.[0] ?? null,
        saluState: saluResponse.data ?? null,
        latestCompletedCheckin: checkinResponse.data ?? null,
      },
    });
  } catch (error) {
    console.error('[status-current-facts] Read failed:', error);
    return NextResponse.json({ error: 'Could not load current status facts' }, { status: 500 });
  }
}
