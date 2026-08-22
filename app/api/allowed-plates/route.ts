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

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('get_all_allowed_plates').range(0, 4999);
    if (error) throw error;

    return NextResponse.json({
      data: (data ?? [])
        .map((row: { regnr?: unknown }) => typeof row.regnr === 'string' ? row.regnr : null)
        .filter((regnr: string | null): regnr is string => Boolean(regnr)),
    });
  } catch (error) {
    console.error('[allowed-plates] Read failed:', error);
    return NextResponse.json({ error: 'Could not load allowed plates' }, { status: 500 });
  }
}
