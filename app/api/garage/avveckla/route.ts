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

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const params = new URL(request.url).searchParams;
  const garageItemId = text(params.get('garage_item_id'));
  if (!garageItemId) return NextResponse.json({ error: 'garage_item_id krävs' }, { status: 400 });

  const admin = adminClient();
  const { data: avvecklaCase, error: caseError } = await admin
    .from('garage_avveckla_cases')
    .select('avveckla_case_id,garage_item_id,regnr,reason,status,started_at,started_by,started_by_email,completed_at,completed_by,completion_event_id')
    .eq('garage_item_id', garageItemId)
    .maybeSingle();

  if (caseError) {
    console.error('[garage/avveckla] case lookup failed', caseError);
    return NextResponse.json({ error: 'Kunde inte läsa AVVECKLA-ärendet' }, { status: 500 });
  }
  if (!avvecklaCase) return NextResponse.json({ data: { case: null, points: [], events: [] } });

  const [pointsRes, eventsRes] = await Promise.all([
    admin
      .from('garage_avveckla_points')
      .select('point_id,avveckla_case_id,point_kind,title,status,outcome_code,outcome_comment,created_at,created_by,created_by_email,completed_at,completed_by,completed_by_email,updated_at')
      .eq('avveckla_case_id', avvecklaCase.avveckla_case_id)
      .order('created_at', { ascending: true }),
    admin
      .from('garage_avveckla_events')
      .select('event_id,avveckla_case_id,garage_item_id,regnr,point_id,event_type,event_key,occurred_at,actor_id,actor_email,actor_source,evidence_reference,payload')
      .eq('avveckla_case_id', avvecklaCase.avveckla_case_id)
      .order('occurred_at', { ascending: false }),
  ]);

  if (pointsRes.error || eventsRes.error) {
    console.error('[garage/avveckla] detail lookup failed', pointsRes.error ?? eventsRes.error);
    return NextResponse.json({ error: 'Kunde inte läsa AVVECKLA-detaljer' }, { status: 500 });
  }

  return NextResponse.json({ data: { case: avvecklaCase, points: pointsRes.data ?? [], events: eventsRes.data ?? [] } });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  const action = text(body.action)?.toUpperCase();
  const admin = adminClient();

  if (action === 'START_CASE') {
    const garageItemId = text(body.garage_item_id);
    const reason = text(body.reason);
    if (!garageItemId || !reason) return NextResponse.json({ error: 'Garage-objekt och orsak krävs' }, { status: 400 });

    const { data, error } = await admin.rpc('start_garage_avveckla_case', {
      p_garage_item_id: garageItemId,
      p_reason: reason,
      p_actor: verification.user.id,
      p_actor_email: verification.user.email ?? null,
    });
    if (error) return rpcError(error.message, 'Kunde inte starta AVVECKLA');
    return NextResponse.json({ data }, { status: 201 });
  }

  if (action === 'ADD_POINT') {
    const avvecklaCaseId = text(body.avveckla_case_id);
    const title = text(body.title);
    const pointKind = text(body.point_kind)?.toUpperCase() ?? 'STANDARD';
    if (!avvecklaCaseId || !title) return NextResponse.json({ error: 'AVVECKLA-ärende och punkt krävs' }, { status: 400 });

    const { data, error } = await admin.rpc('add_garage_avveckla_point', {
      p_avveckla_case_id: avvecklaCaseId,
      p_title: title,
      p_point_kind: pointKind,
      p_actor: verification.user.id,
      p_actor_email: verification.user.email ?? null,
    });
    if (error) return rpcError(error.message, 'Kunde inte lägga till AVVECKLA-punkt');
    return NextResponse.json({ data }, { status: 201 });
  }

  if (action === 'CLOSE_POINT') {
    const pointId = text(body.point_id);
    const outcomeCode = text(body.outcome_code);
    if (!pointId || !outcomeCode) return NextResponse.json({ error: 'AVVECKLA-punkt och strukturerat utfall krävs' }, { status: 400 });

    const { data, error } = await admin.rpc('close_garage_avveckla_point', {
      p_point_id: pointId,
      p_outcome_code: outcomeCode,
      p_outcome_comment: text(body.outcome_comment),
      p_actor: verification.user.id,
      p_actor_email: verification.user.email ?? null,
    });
    if (error) return rpcError(error.message, 'Kunde inte avsluta AVVECKLA-punkten');
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: 'Ogiltig AVVECKLA-åtgärd' }, { status: 400 });
}

function rpcError(message: string | undefined, fallback: string) {
  const resolved = message || fallback;
  const conflict = /redan|fryst|kan inte|kräver|saknas|öppen|ogiltig/i.test(resolved);
  return NextResponse.json({ error: resolved }, { status: conflict ? 409 : 500 });
}
