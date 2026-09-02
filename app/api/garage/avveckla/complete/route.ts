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

function occurredAt(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const RPC_BY_METHOD = {
  EGEN_LEVERANS: 'verify_garage_avveckla_egen_leverans',
  EXTERN_TRANSPORT: 'verify_garage_avveckla_extern_transport',
  AVSTALLNING: 'verify_garage_avveckla_avstallning',
} as const;

type Method = keyof typeof RPC_BY_METHOD;

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 });
  }

  const garageItemId = text(body.garage_item_id);
  const method = text(body.method)?.toUpperCase() as Method | undefined;
  const eventTime = occurredAt(body.occurred_at);
  const evidenceReference = text(body.evidence_reference);

  if (!garageItemId || !method || !(method in RPC_BY_METHOD) || !eventTime || !evidenceReference) {
    return NextResponse.json({ error: 'Garage-objekt, UT-väg, verklig tidpunkt och evidensreferens krävs' }, { status: 400 });
  }

  const admin = adminClient();
  const rpc = RPC_BY_METHOD[method];
  const { data, error } = await admin.rpc(rpc, {
    p_garage_item_id: garageItemId,
    p_occurred_at: eventTime,
    p_evidence_reference: evidenceReference,
    p_actor: verification.user.id,
    p_actor_email: verification.user.email ?? null,
  });

  if (error) {
    console.error('[garage/avveckla/complete] failed', { method, error });
    const message = error.message || 'Kunde inte verifiera UT';
    const conflict = /ÖPPEN|redan|mismatch|Flera öppna|före aktuell|Makulerat|Ny bil|riktning UT/i.test(message);
    const notFound = /saknas|finns inte/i.test(message);
    return NextResponse.json({ error: message }, { status: notFound ? 404 : conflict ? 409 : 500 });
  }

  return NextResponse.json({ data });
}
