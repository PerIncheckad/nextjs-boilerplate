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

function uuidArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
  return rows.length === value.length ? rows : null;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });
  const garageItemId = text(new URL(request.url).searchParams.get('garage_item_id'));
  if (!garageItemId) return NextResponse.json({ error: 'garage_item_id krävs' }, { status: 400 });
  const admin = adminClient();

  const { data: final, error: finalError } = await admin
    .from('garage_sista_incheckningar')
    .select('sista_incheckning_id,garage_item_id,salu_plan_id,source_salu_flag_id,decision_id,decision_version,checkin_id,regnr,final_checkin_completed_at,verified_at')
    .eq('garage_item_id', garageItemId)
    .maybeSingle();
  if (finalError) return NextResponse.json({ error: 'Kunde inte läsa SISTA INCHECKNING' }, { status: 500 });
  if (!final) return NextResponse.json({ data: { final: null, buhsSource: [], verification: null, handoff: null, archived: null } });

  const [sourceIds, verificationResult, handoffResult, archivedResult] = await Promise.all([
    admin.rpc('current_salu_buhs_source_ids_v1', { p_sista_incheckning_id: final.sista_incheckning_id }),
    admin.from('salu_v2_buhs_verifications').select('*').eq('sista_incheckning_id', final.sista_incheckning_id).order('revision_no', { ascending: false }).limit(1).maybeSingle(),
    admin.from('garage_salu_v2_avveckla_handoffs').select('*').eq('sista_incheckning_id', final.sista_incheckning_id).maybeSingle(),
    admin.from('salu_v2_avvecklad_current').select('*').eq('sista_incheckning_id', final.sista_incheckning_id).maybeSingle(),
  ]);
  if (sourceIds.error || verificationResult.error || handoffResult.error || archivedResult.error) {
    console.error('[garage/salu-step4] read failed', sourceIds.error || verificationResult.error || handoffResult.error || archivedResult.error);
    return NextResponse.json({ error: 'Kunde inte läsa Step 4-status' }, { status: 500 });
  }

  const ids = (sourceIds.data ?? []) as string[];
  const { data: damages, error: damageError } = ids.length
    ? await admin.from('damages').select('id,regnr,damage_date,damage_type_raw,note_customer,note_internal,vehiclenote').in('id', ids).order('damage_date', { ascending: true })
    : { data: [], error: null };
  if (damageError) return NextResponse.json({ error: 'Kunde inte läsa BUHS-källrader' }, { status: 500 });

  let rows: unknown[] = [];
  if (verificationResult.data?.buhs_verification_id) {
    const { data, error } = await admin.from('salu_v2_buhs_verification_rows').select('damage_id,disposition').eq('buhs_verification_id', verificationResult.data.buhs_verification_id);
    if (error) return NextResponse.json({ error: 'Kunde inte läsa BUHS-verifieringsrader' }, { status: 500 });
    rows = data ?? [];
  }

  return NextResponse.json({
    data: {
      final,
      buhsSource: damages ?? [],
      currentBuhsIds: ids,
      verification: verificationResult.data ? { ...verificationResult.data, rows } : null,
      handoff: handoffResult.data ?? null,
      archived: archivedResult.data ?? null,
    },
  });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }
  const action = text(body.action)?.toUpperCase();
  const admin = adminClient();

  if (action === 'VERIFY_BUHS') {
    const sistaIncheckningId = text(body.sista_incheckning_id);
    const expectedDamageIds = uuidArray(body.damage_ids);
    const idempotencyKey = text(body.idempotency_key);
    if (!sistaIncheckningId || expectedDamageIds === null || !idempotencyKey) {
      return NextResponse.json({ error: 'sista_incheckning_id, exakt damage_ids-lista och idempotency_key krävs' }, { status: 400 });
    }
    const { data, error } = await admin.rpc('verify_salu_v2_buhs_v1', {
      p_sista_incheckning_id: sistaIncheckningId,
      p_expected_damage_ids: expectedDamageIds,
      p_idempotency_key: idempotencyKey,
      p_actor_email: verification.user.email,
      p_auth_user_id: verification.user.id,
    });
    if (error) {
      const forbidden = error.code === '42501';
      const conflict = /MISMATCH|STALE|REQUIRED|CONFLICT|ACTIVE/i.test(error.message ?? '');
      return NextResponse.json({ error: error.message || 'BUHS-verifiering misslyckades' }, { status: forbidden ? 403 : conflict ? 409 : 500 });
    }
    return NextResponse.json({ data });
  }

  if (action === 'START_AVVECKLA') {
    const sistaIncheckningId = text(body.sista_incheckning_id);
    const buhsVerificationId = text(body.buhs_verification_id);
    if (!sistaIncheckningId || !buhsVerificationId) return NextResponse.json({ error: 'SISTA INCHECKNING och BUHS-verifiering krävs' }, { status: 400 });
    const { data, error } = await admin.rpc('start_salu_v2_avveckla_v1', {
      p_sista_incheckning_id: sistaIncheckningId,
      p_buhs_verification_id: buhsVerificationId,
      p_actor: verification.user.id,
      p_actor_email: verification.user.email ?? null,
    });
    if (error) {
      const notFound = error.code === 'P0002';
      return NextResponse.json({ error: error.message || 'SALU V2 → AVVECKLA-handoff misslyckades' }, { status: notFound ? 404 : 409 });
    }
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: 'Ogiltig Step 4-action' }, { status: 400 });
}
