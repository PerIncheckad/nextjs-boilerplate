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

function dateTime(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const STATUSES = ['EJ_FAKTURERAD', 'FAKTURAUNDERLAG', 'FAKTURERAD'] as const;
type BillingStatus = (typeof STATUSES)[number];

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const url = new URL(request.url);
  const status = text(url.searchParams.get('status'))?.toUpperCase() as BillingStatus | undefined;
  if (status && !STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Ogiltig faktureringsstatus' }, { status: 400 });
  }

  const admin = adminClient();
  let query = admin
    .from('billable_driving_events')
    .select('billing_event_id,source_event_id,garage_item_id,avveckla_case_id,regnr,event_type,from_location,to_location,price_class,base_price,price,price_basis,price_list_id,price_list_version,performed_at,performed_by_email,billing_status,invoice_number,invoiced_at,created_at,updated_at')
    .order('performed_at', { ascending: false })
    .order('billing_event_id', { ascending: false });

  if (status) query = query.eq('billing_status', status);

  const { data, error } = await query;
  if (error) {
    console.error('[billing/driving] read failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa fakturerbara körningar' }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 });
  }

  const billingEventId = text(body.billing_event_id);
  const targetStatus = text(body.target_status)?.toUpperCase() as BillingStatus | undefined;
  const invoiceNumber = text(body.invoice_number);
  const invoicedAt = dateTime(body.invoiced_at);

  if (!billingEventId || !targetStatus || !['FAKTURAUNDERLAG', 'FAKTURERAD'].includes(targetStatus)) {
    return NextResponse.json({ error: 'Körningspost och giltig nästa faktureringsstatus krävs' }, { status: 400 });
  }
  if (targetStatus === 'FAKTURERAD' && (!invoiceNumber || !invoicedAt)) {
    return NextResponse.json({ error: 'Fakturanummer och fakturadatum krävs för FAKTURERAD' }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc('transition_billable_driving_event', {
    p_billing_event_id: billingEventId,
    p_target_status: targetStatus,
    p_invoice_number: targetStatus === 'FAKTURERAD' ? invoiceNumber : null,
    p_invoiced_at: targetStatus === 'FAKTURERAD' ? invoicedAt : null,
    p_actor: verification.user.id,
    p_actor_email: verification.user.email ?? null,
  });

  if (error) {
    console.error('[billing/driving] transition failed', error);
    const message = error.message || 'Kunde inte uppdatera faktureringsstatus';
    const notFound = /finns inte/i.test(message);
    const conflict = /Ogiltig faktureringsövergång|fryst/i.test(message);
    return NextResponse.json({ error: message }, { status: notFound ? 404 : conflict ? 409 : 500 });
  }

  return NextResponse.json({ data });
}
