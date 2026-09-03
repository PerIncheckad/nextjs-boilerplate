import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
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

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const url = new URL(request.url);
  const garageItemId = text(url.searchParams.get('garage_item_id'));
  if (!garageItemId) return NextResponse.json({ error: 'garage_item_id krävs' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin
    .from('garage_avveckla_transport_bookings')
    .select('booking_id,avveckla_case_id,garage_item_id,regnr,booked_at,deadline_at,booking_reference,picked_up_at,pickup_event_id,deviation_at,alert_at,created_at,updated_at')
    .eq('garage_item_id', garageItemId)
    .maybeSingle();

  if (error) {
    console.error('[garage/avveckla/transport] read failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa transportbokningen' }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? null });
}

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
  const bookedAt = parseOperationalDateTime(body.booked_at);
  const bookingReference = text(body.booking_reference);

  if (!garageItemId || !bookedAt) {
    return NextResponse.json({ error: 'Garage-objekt och verklig bokningstid krävs' }, { status: 400 });
  }

  if (new Date(bookedAt).getTime() > Date.now() + 5 * 60_000) {
    return NextResponse.json({ error: 'Verklig bokningstid kan inte ligga i framtiden' }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc('book_garage_avveckla_transport', {
    p_garage_item_id: garageItemId,
    p_booked_at: bookedAt,
    p_booking_reference: bookingReference,
    p_actor: verification.user.id,
    p_actor_email: verification.user.email ?? null,
  });

  if (error) {
    console.error('[garage/avveckla/transport] booking failed', error);
    const message = error.message || 'Kunde inte registrera transportbokningen';
    const conflict = /endast|krävs före|mismatch|fryst|redan/i.test(message);
    const notFound = /finns inte/i.test(message);
    return NextResponse.json({ error: message }, { status: notFound ? 404 : conflict ? 409 : 500 });
  }

  return NextResponse.json({ data });
}
