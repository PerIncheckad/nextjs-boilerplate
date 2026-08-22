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

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  try {
    const body = await request.json() as { damage?: Record<string, unknown> };
    if (!body.damage || typeof body.damage !== 'object') {
      return NextResponse.json({ error: 'Missing damage' }, { status: 400 });
    }

    const admin = createAdminClient();
    const response = await admin.from('damages').insert(body.damage);
    if (response.error) throw response.error;

    return NextResponse.json({ data: { created: true } });
  } catch (error) {
    console.error('[api/nybil/damages] POST failed:', error);
    return NextResponse.json({ error: 'Could not save Nybil damage' }, { status: 500 });
  }
}
