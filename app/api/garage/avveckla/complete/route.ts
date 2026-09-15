import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import { quoteEtPrice } from '@/lib/et-price-list-2026';
import { parseOperationalDateTime } from '@/lib/server/swedish-local-datetime';

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

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const LEGACY_RPC_BY_METHOD = {
  EXTERN_TRANSPORT: 'verify_garage_avveckla_extern_transport',
  AVSTALLNING: 'verify_garage_avveckla_avstallning',
} as const;

const SALU_RPC_BY_METHOD = {
  EXTERN_TRANSPORT: 'verify_salu_v2_avveckla_extern_transport_v1',
  AVSTALLNING: 'verify_salu_v2_avveckla_avstallning_v1',
} as const;

type Method = 'EGEN_LEVERANS' | keyof typeof LEGACY_RPC_BY_METHOD;

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  const garageItemId = text(body.garage_item_id);
  const method = text(body.method)?.toUpperCase() as Method | undefined;
  const eventTime = parseOperationalDateTime(body.occurred_at);
  const evidenceReference = text(body.evidence_reference);

  if (!garageItemId || !method || !['EGEN_LEVERANS', 'EXTERN_TRANSPORT', 'AVSTALLNING'].includes(method) || !eventTime || !evidenceReference) {
    return NextResponse.json({ error: 'Garage-objekt, UT-väg, verklig tidpunkt och evidensreferens krävs' }, { status: 400 });
  }
  if (new Date(eventTime).getTime() > Date.now() + 5 * 60_000) {
    return NextResponse.json({ error: 'Verklig UT-tidpunkt kan inte ligga i framtiden' }, { status: 400 });
  }

  const admin = adminClient();
  const { data: saluHandoff, error: handoffError } = await admin
    .from('garage_salu_v2_avveckla_handoffs')
    .select('salu_v2_handoff_id,handoff_revision')
    .eq('garage_item_id', garageItemId)
    .order('handoff_revision', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (handoffError) return NextResponse.json({ error: 'Kunde inte verifiera terminal källa' }, { status: 500 });
  const isSaluV2 = Boolean(saluHandoff?.salu_v2_handoff_id);

  if (method === 'EGEN_LEVERANS') {
    if (typeof body.billable_driving !== 'boolean') {
      return NextResponse.json({ error: 'Ange uttryckligen om egen leverans är fakturerbar: Ja eller Nej' }, { status: 400 });
    }
    const isBillable = body.billable_driving;
    let quote: ReturnType<typeof quoteEtPrice> | null = null;
    if (isBillable) {
      const fromLocation = text(body.from_location);
      const toLocation = text(body.to_location);
      const priceClass = text(body.price_class);
      if (!fromLocation || !toLocation || !priceClass) {
        return NextResponse.json({ error: 'FRÅN, TILL och bilplats/prisklass krävs för fakturerbar egen leverans' }, { status: 400 });
      }
      try {
        quote = quoteEtPrice({ fromLocation, toLocation, priceClass, quotedPrice: positiveNumber(body.quoted_price) });
      } catch (reasonValue) {
        return NextResponse.json({ error: reasonValue instanceof Error ? reasonValue.message : 'Ogiltig ET-prissättning' }, { status: 400 });
      }
    }

    const rpc = isSaluV2 ? 'verify_salu_v2_avveckla_egen_leverans_with_billing_v1' : 'verify_garage_avveckla_egen_leverans_with_billing';
    const { data, error } = await admin.rpc(rpc, {
      p_garage_item_id: garageItemId,
      p_occurred_at: eventTime,
      p_evidence_reference: evidenceReference,
      p_is_billable: isBillable,
      p_from_location: quote?.fromLocation ?? null,
      p_to_location: quote?.toLocation ?? null,
      p_price_class: quote?.priceClass ?? null,
      p_base_price: quote?.basePrice ?? null,
      p_price: quote?.price ?? null,
      p_price_basis: quote?.priceBasis ?? null,
      p_price_list_id: quote?.priceListId ?? null,
      p_price_list_version: quote?.priceListVersion ?? null,
      p_actor: verification.user.id,
      p_actor_email: verification.user.email ?? null,
    });
    if (error) return rpcFailure(method, error.message);
    return NextResponse.json({ data });
  }

  const rpc = isSaluV2 ? SALU_RPC_BY_METHOD[method] : LEGACY_RPC_BY_METHOD[method];
  const { data, error } = await admin.rpc(rpc, {
    p_garage_item_id: garageItemId,
    p_occurred_at: eventTime,
    p_evidence_reference: evidenceReference,
    p_actor: verification.user.id,
    p_actor_email: verification.user.email ?? null,
  });
  if (error) return rpcFailure(method, error.message);
  return NextResponse.json({ data });
}

function rpcFailure(method: Method, raw?: string) {
  console.error('[garage/avveckla/complete] failed', { method, error: raw });
  const message = raw || 'Kunde inte verifiera UT';
  const conflict = /ÖPPEN|redan|mismatch|Flera öppna|före aktuell|Makulerat|Ny bil|riktning UT|HANDOFF|STALE|REQUIRED|CONFLICT|SOURCE/i.test(message);
  const notFound = /saknas|finns inte|NOT_FOUND/i.test(message);
  return NextResponse.json({ error: message }, { status: notFound ? 404 : conflict ? 409 : 500 });
}
