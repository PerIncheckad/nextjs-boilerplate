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

function date(value: unknown): string | null {
  const next = text(value);
  return next && /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
}

function mapError(message: string) {
  if (/finns inte|not found/i.test(message)) return 404;
  if (/krävs|ogiltigt|före planerat/i.test(message)) return 400;
  if (/stängd|closed/i.test(message)) return 409;
  return 500;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = adminClient();
  const { data: flags, error: flagError } = await admin
    .from('salu_flags')
    .select('flag_id,regnr,cycle_saludatum,current_saludatum,status,escalation_status,created_at,acknowledged_at')
    .neq('status', 'STÄNGD')
    .order('current_saludatum', { ascending: true });

  if (flagError) {
    console.error('[salu/planning] flags failed', flagError);
    return NextResponse.json({ error: 'Kunde inte läsa SALU-planeringen' }, { status: 500 });
  }

  const flagIds = (flags ?? []).map((row) => row.flag_id);
  const regnrs = [...new Set((flags ?? []).map((row) => row.regnr))];

  const [plansResponse, checkpointsResponse, childrenResponse, statesResponse, garageResponse] = await Promise.all([
    flagIds.length
      ? admin.from('salu_plans').select('*').in('flag_id', flagIds)
      : Promise.resolve({ data: [], error: null }),
    flagIds.length
      ? admin.from('salu_checkpoints').select('flag_id,status').in('flag_id', flagIds)
      : Promise.resolve({ data: [], error: null }),
    flagIds.length
      ? admin.from('salu_child_processes').select('flag_id,status').in('flag_id', flagIds)
      : Promise.resolve({ data: [], error: null }),
    regnrs.length
      ? admin.from('salu_vehicle_state').select('regnr,ny_date,original_saludatum,current_saludatum').in('regnr', regnrs)
      : Promise.resolve({ data: [], error: null }),
    flagIds.length
      ? admin.from('garage_items').select('garage_item_id,source_salu_flag_id').eq('source_kind', 'SALU_PLANERING').in('source_salu_flag_id', flagIds).is('voided_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const [label, response] of [
    ['plans', plansResponse],
    ['checkpoints', checkpointsResponse],
    ['children', childrenResponse],
    ['states', statesResponse],
    ['garage', garageResponse],
  ] as const) {
    if (response.error) {
      console.error(`[salu/planning] ${label} failed`, response.error);
      return NextResponse.json({ error: 'Kunde inte läsa SALU-planeringsunderlaget' }, { status: 500 });
    }
  }

  const plans = new Map((plansResponse.data ?? []).map((row) => [row.flag_id, row]));
  const states = new Map((statesResponse.data ?? []).map((row) => [row.regnr, row]));
  const garage = new Map((garageResponse.data ?? []).map((row) => [row.source_salu_flag_id, row.garage_item_id]));
  const checkpoints = checkpointsResponse.data ?? [];
  const children = childrenResponse.data ?? [];

  const data = (flags ?? []).map((flag) => {
    const waitingCheckpoints = checkpoints.filter((row) => row.flag_id === flag.flag_id && row.status === 'VÄNTAR').length;
    const openChildProcesses = children.filter(
      (row) => row.flag_id === flag.flag_id && !['VERIFIED', 'CANCELLED'].includes(row.status),
    ).length;

    return {
      ...flag,
      vehicle_state: states.get(flag.regnr) ?? null,
      plan: plans.get(flag.flag_id) ?? null,
      garage_item_id: garage.get(flag.flag_id) ?? null,
      blockers: {
        waiting_checkpoints: waitingCheckpoints,
        open_child_processes: openChildProcesses,
      },
    };
  });

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 });
  }

  const flagId = text(body.flag_id ?? body.flagId);
  const planningMode = text(body.planning_mode ?? body.planningMode)?.toUpperCase() ?? null;
  if (!flagId) return NextResponse.json({ error: 'flag_id saknas' }, { status: 400 });
  if (!planningMode || !['QUICK', 'INDIVIDUAL'].includes(planningMode)) {
    return NextResponse.json({ error: 'planning_mode måste vara QUICK eller INDIVIDUAL' }, { status: 400 });
  }

  const transportMode = text(body.transport_mode ?? body.transportMode)?.toUpperCase() ?? 'EJ_BESLUTAD';
  if (!['EJ_BESLUTAD', 'TRANSPORT', 'EGEN_KORNING'].includes(transportMode)) {
    return NextResponse.json({ error: 'Ogiltigt transportsätt' }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc('plan_salu_for_garage_v2', {
    p_flag_id: flagId,
    p_planning_mode: planningMode,
    p_planned_saludatum: planningMode === 'QUICK' ? null : date(body.planned_saludatum ?? body.plannedSaludatum),
    p_proposed_end_date: date(body.proposed_end_date ?? body.proposedEndDate),
    p_salu_destination: text(body.salu_destination ?? body.saluDestination),
    p_transport_mode: transportMode,
    p_repair_destination: text(body.repair_destination ?? body.repairDestination),
    p_transport_book_by: date(body.transport_book_by ?? body.transportBookBy),
    p_note: text(body.note),
    p_actor_id: verification.user.id,
  });

  if (error) {
    console.error('[salu/planning] plan failed', error);
    return NextResponse.json({ error: error.message || 'SALU-planeringen kunde inte sparas' }, { status: mapError(error.message || '') });
  }

  return NextResponse.json({ data }, { status: 201 });
}
