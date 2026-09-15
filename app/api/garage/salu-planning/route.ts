import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const TRANSPORT = new Set(['EJ_BOKAD', 'TRANSPORTBOKAD', 'PA_VAG']);

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

async function resolveActiveEmployeeId(admin: ReturnType<typeof adminClient>, email: string): Promise<string | null> {
  const { data, error } = await admin.rpc('resolve_active_employee_identity_v1', { p_email: email });
  if (error) {
    if (error.code === '42501') return null;
    throw error;
  }
  return typeof data === 'string' ? data : null;
}

async function canDecideSistaHyran(
  admin: ReturnType<typeof adminClient>,
  employeeId: string,
  garageItemId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('actor_can_decide_garage_sista_hyran_v1', {
    p_employee_id: employeeId,
    p_garage_item_id: garageItemId,
  });
  if (error) throw error;
  return data === true;
}

async function swedishLocalTimestamp(
  admin: ReturnType<typeof adminClient>,
  value: unknown,
): Promise<string | null> {
  const local = text(value);
  if (!local) return null;
  const { data, error } = await admin.rpc('swedish_local_datetime_to_timestamptz_v1', {
    p_local_datetime: local,
  });
  if (error) throw error;
  return typeof data === 'string' ? data : null;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = adminClient();
  const { data: items, error: itemError } = await admin
    .from('garage_items')
    .select('garage_item_id,model,regnr,garage_direction,source_kind,source_salu_flag_id,planned_station,transport_status,salu_final_timing_at,salu_transport_details,salu_repair_destination,salu_operational_note,created_at,updated_at')
    .eq('source_kind', 'SALU_PLANERING')
    .is('voided_at', null)
    .is('handed_off_nybil_id', null)
    .is('completed_at', null)
    .order('updated_at', { ascending: false });

  if (itemError) {
    console.error('[garage-salu-planning] Garage lookup failed', itemError);
    return NextResponse.json({ error: 'Kunde inte läsa SALU-planeringen i Garaget' }, { status: 500 });
  }

  const rows = items ?? [];
  const flagIds = rows.map((item) => item.source_salu_flag_id).filter((value): value is string => Boolean(value));
  const itemIds = rows.map((item) => item.garage_item_id);

  const [plansResult, decisionsResult] = await Promise.all([
    flagIds.length
      ? admin.from('salu_plans').select('plan_id,flag_id,regnr,planning_mode,source_saludatum,planned_saludatum,proposed_end_date,salu_destination,transport_mode,repair_destination,transport_book_by,note,status,planned_at').in('flag_id', flagIds)
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? admin.from('garage_sista_hyran_current').select('decision_id,garage_item_id,salu_plan_id,source_salu_flag_id,regnr,sista_hyran,decision_status,decision_version,last_rental_at,decision_note,decided_at,decided_by_employee_id,supersedes_decision_id').in('garage_item_id', itemIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (plansResult.error || decisionsResult.error) {
    console.error('[garage-salu-planning] Source/read-contract lookup failed', plansResult.error || decisionsResult.error);
    return NextResponse.json({ error: 'Kunde inte läsa SALU-underlaget' }, { status: 500 });
  }

  const planByFlag = new Map((plansResult.data ?? []).map((plan) => [plan.flag_id, plan]));
  const decisionByItem = new Map((decisionsResult.data ?? []).map((decision) => [decision.garage_item_id, decision]));

  let employeeId: string | null = null;
  const decisionAuthorization = new Map<string, boolean>();
  try {
    employeeId = await resolveActiveEmployeeId(admin, verification.user.email);
    if (employeeId) {
      const decisions = await Promise.all(rows.map(async (item) => [
        item.garage_item_id,
        await canDecideSistaHyran(admin, employeeId as string, item.garage_item_id),
      ] as const));
      for (const [garageItemId, allowed] of decisions) decisionAuthorization.set(garageItemId, allowed);
    }
  } catch (error) {
    console.error('[garage-salu-planning] mandate read failed', error);
  }

  return NextResponse.json({
    data: rows.map((item) => ({
      ...item,
      source_plan: item.source_salu_flag_id ? planByFlag.get(item.source_salu_flag_id) ?? null : null,
      sista_hyran: decisionByItem.get(item.garage_item_id) ?? null,
      can_decide_sista_hyran: decisionAuthorization.get(item.garage_item_id) === true,
    })),
    authorization: {
      employee_resolved: Boolean(employeeId),
    },
  });
}

export async function PATCH(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  const garageItemId = text(body.garage_item_id);
  if (!garageItemId) return NextResponse.json({ error: 'garage_item_id saknas' }, { status: 400 });

  const admin = adminClient();
  const { data: item, error: itemError } = await admin
    .from('garage_items')
    .select('garage_item_id,source_kind,source_salu_flag_id,garage_direction,voided_at,handed_off_nybil_id,completed_at')
    .eq('garage_item_id', garageItemId)
    .maybeSingle();

  if (itemError) return NextResponse.json({ error: 'Kunde inte läsa Garage-objektet' }, { status: 500 });
  if (!item || item.voided_at) return NextResponse.json({ error: 'Garage-objektet finns inte eller är makulerat' }, { status: 404 });
  if (item.source_kind !== 'SALU_PLANERING' || !item.source_salu_flag_id) return NextResponse.json({ error: 'Objektet är inte SALU PLANERING' }, { status: 409 });
  if (item.garage_direction !== null) return NextResponse.json({ error: 'SALU PLANERING måste vara riktningslös' }, { status: 409 });
  if (item.handed_off_nybil_id || item.completed_at) return NextResponse.json({ error: 'Garage-objektet är i en senare låst fas' }, { status: 409 });

  if (Object.hasOwn(body, 'garage_direction')) {
    return NextResponse.json({ error: 'SALU PLANERING får inte ges fysisk IN/UT-riktning' }, { status: 409 });
  }

  if (Object.hasOwn(body, 'planned_station')) {
    const station = text(body.planned_station);
    if (station) {
      const { data: stationRow, error: stationError } = await admin.from('planning_stations').select('station_code').eq('station_code', station).eq('is_active', true).maybeSingle();
      if (stationError) return NextResponse.json({ error: 'Kunde inte verifiera station' }, { status: 500 });
      if (!stationRow) return NextResponse.json({ error: 'Ogiltig station' }, { status: 400 });
    }
    const { data, error } = await admin.rpc('replan_garage_station', {
      p_garage_item_id: garageItemId,
      p_to_station: station,
      p_reason: text(body.station_change_reason) ?? 'SALU operativ planering',
      p_actor: verification.user.id,
    });
    if (error) {
      console.error('[garage-salu-planning] station update failed', error);
      return NextResponse.json({ error: 'Kunde inte uppdatera station' }, { status: 500 });
    }
    return NextResponse.json({ data });
  }

  const changes: Record<string, unknown> = {};
  if (Object.hasOwn(body, 'transport_status')) {
    const transportStatus = text(body.transport_status)?.toUpperCase() ?? null;
    if (!transportStatus || !TRANSPORT.has(transportStatus)) return NextResponse.json({ error: 'Ogiltig transportstatus' }, { status: 400 });
    changes.transport_status = transportStatus;
  }
  if (Object.hasOwn(body, 'salu_final_timing_at')) {
    if (body.salu_final_timing_at === null || body.salu_final_timing_at === '') {
      changes.salu_final_timing_at = null;
    } else {
      try {
        const value = await swedishLocalTimestamp(admin, body.salu_final_timing_at);
        if (!value) return NextResponse.json({ error: 'Ogiltig definitiv timing' }, { status: 400 });
        changes.salu_final_timing_at = value;
      } catch (error) {
        console.error('[garage-salu-planning] Swedish timing conversion failed', error);
        return NextResponse.json({ error: 'Ogiltig eller tvetydig svensk lokal tid' }, { status: 400 });
      }
    }
  }
  for (const field of ['salu_transport_details', 'salu_repair_destination', 'salu_operational_note'] as const) {
    if (Object.hasOwn(body, field)) changes[field] = text(body[field]);
  }

  if (Object.keys(changes).length === 0) return NextResponse.json({ error: 'Inga giltiga Garage-kompletteringar' }, { status: 400 });

  const { data, error } = await admin
    .from('garage_items')
    .update({ ...changes, updated_at: new Date().toISOString(), updated_by: verification.user.id })
    .eq('garage_item_id', garageItemId)
    .eq('source_kind', 'SALU_PLANERING')
    .is('garage_direction', null)
    .is('voided_at', null)
    .is('handed_off_nybil_id', null)
    .is('completed_at', null)
    .select('*')
    .single();

  if (error) {
    console.error('[garage-salu-planning] operational update failed', error);
    return NextResponse.json({ error: 'Kunde inte spara Garage-kompletteringen' }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  if (text(body.action)?.toUpperCase() !== 'SISTA_HYRAN') {
    return NextResponse.json({ error: 'Ogiltig Garage-action' }, { status: 400 });
  }

  const garageItemId = text(body.garage_item_id);
  const idempotencyKey = text(body.idempotency_key);
  if (!garageItemId || !idempotencyKey) return NextResponse.json({ error: 'garage_item_id och idempotency_key krävs' }, { status: 400 });

  const lastRentalLocal = text(body.last_rental_at);
  const admin = adminClient();
  const { data, error } = await admin.rpc('decide_garage_sista_hyran_v1', {
    p_garage_item_id: garageItemId,
    p_actor_email: verification.user.email,
    p_auth_user_id: verification.user.id,
    p_last_rental_local: lastRentalLocal,
    p_decision_note: text(body.decision_note),
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const forbidden = error.code === '42501';
    const invalidTiming = error.code === '22023';
    console.error('[garage-salu-planning] SISTA HYRAN decision failed', error);
    if (invalidTiming) return NextResponse.json({ error: 'Ogiltig eller tvetydig svensk lokal tid för SISTA HYRAN' }, { status: 400 });
    return NextResponse.json({ error: forbidden ? 'Employee-identitet, mandat eller stationsbehörighet saknas för SISTA HYRAN' : 'SISTA HYRAN kunde inte sparas' }, { status: forbidden ? 403 : 409 });
  }

  return NextResponse.json({ data });
}
