import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  const garageItemId = text(body.garage_item_id);
  const decisionId = text(body.decision_id);
  if (!garageItemId || !decisionId) return NextResponse.json({ error: 'garage_item_id och decision_id krävs' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin.rpc('arm_garage_sista_incheckning_intent_v1', {
    p_garage_item_id: garageItemId,
    p_decision_id: decisionId,
    p_auth_user_id: verification.user.id,
  });

  if (error) {
    console.error('[check-salu-final-arm] Exact provenance arming failed', error);
    return NextResponse.json({ error: 'SISTA INCHECKNING kunde inte knytas till exakt SISTA HYRAN-beslut' }, { status: 409 });
  }

  return NextResponse.json({ data });
}
