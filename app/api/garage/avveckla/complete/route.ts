import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import { quoteEtPrice } from '@/lib/et-price-list-2026';

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

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const RPC_BY_METHOD = {
  EXTERN_TRANSPORT: 'verify_garage_avveckla_extern_transport',
  AVSTALLNING: 'verify_garage_avveckla_avstallning',
} as const;

type Method = 'EGEN_LEVERANS' | keyof typeof RPC_BY_METHOD;

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

  if (!garageItemId || !method || !['EGEN_LEVERANS', 'EXTERN_TRANSPORT', 'AVSTALLNING'].includes(method) || !eventTime || !evidenceReference) {
    return NextResponse.json({ error: 'Garage-objekt, UT-väg, verklig tidpunkt och evidensreferens krävs' }, { status: 400 });
  }

  const admin = adminClient();

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
        quote = quoteEtPrice({
          fromLocation,
          toLocation,
          priceClass,
          quotedPrice: positiveNumber(body.quoted_price),
        });
      } catch (reasonValue) {
        return NextResponse.json({ error: reasonValue instanceof Error ? reasonValue.message : 'Ogiltig ET-prissättning' }, { status: 400 });
      }
    }

    const { data, error } = await admin.rpc('verify_garage_avveckla_egen_leverans_with_billing', {
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

    if (error) {
      console.error('[garage/avveckla/complete] failed', { method, error });
      const message = error.message || 'Kunde inte verifiera UT';
      const conflict = /ÖPPEN|redan|mismatch|Flera öppna|före aktuell|Makulerat|Ny bil|riktning UT/i.test(message);
      const notFound = /saknas|finns inte/i.test(message);
      return NextResponse.json({ error: message }, { status: notFound ? 404 : conflict ? 409 : 500 });
    }

    return NextResponse.json({ data });
  }

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
