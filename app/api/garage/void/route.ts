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

const VERIFIED_SALU_VOID_BLOCK_REASON = 'Verifierad SALU → Garage-mottagare kan inte makuleras genom generell Garage-makulering';
const VERIFIED_LEGACY_VOID_BLOCK_REASON = 'Verifierad LEGACY → Garage-mottagare kan inte makuleras genom generell Garage-makulering';

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const garageItemId = text(new URL(request.url).searchParams.get('garage_item_id'));
  if (!garageItemId) {
    return NextResponse.json({ error: 'Garage-objekt krävs' }, { status: 400 });
  }

  const admin = adminClient();
  const [saluCapability, legacyCapability] = await Promise.all([
    admin.rpc('is_verified_salu_garage_recipient_v1', { p_garage_item_id: garageItemId }),
    admin.rpc('is_canonical_legacy_garage_recipient_v1', { p_garage_item_id: garageItemId }),
  ]);

  if (saluCapability.error || legacyCapability.error) {
    console.error('[garage/void] capability failed', saluCapability.error ?? legacyCapability.error);
    return NextResponse.json({ error: 'Kunde inte verifiera makuleringsrätt' }, { status: 500 });
  }

  const protectedSaluRecipient = saluCapability.data === true;
  const protectedLegacyRecipient = legacyCapability.data === true;
  const protectedRecipient = protectedSaluRecipient || protectedLegacyRecipient;
  const blockReason = protectedSaluRecipient
    ? VERIFIED_SALU_VOID_BLOCK_REASON
    : protectedLegacyRecipient
      ? VERIFIED_LEGACY_VOID_BLOCK_REASON
      : null;

  return NextResponse.json({
    data: {
      void_allowed: !protectedRecipient,
      void_block_reason: blockReason,
    },
  });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  const garageItemId = text(body.garage_item_id);
  const reason = text(body.reason);
  if (!garageItemId || !reason) {
    return NextResponse.json({ error: 'Garage-objekt och orsak krävs' }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc('void_garage_item', {
    p_garage_item_id: garageItemId,
    p_reason: reason,
    p_actor: verification.user.id,
  });

  if (error) {
    console.error('[garage/void] failed', error);
    const message = error.message || 'Kunde inte makulera Garage-objektet';
    const blocked = /Ny bil|hjulskifteshistorik|permanent|Verifierad SALU|Verifierad LEGACY|kan inte makuleras/i.test(message);
    return NextResponse.json({ error: message }, { status: blocked ? 409 : 500 });
  }

  return NextResponse.json({ data });
}