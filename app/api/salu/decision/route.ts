import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function mapError(message: string) {
  if (/not found|finns inte/i.test(message)) return 404;
  if (/krävs|requires|invalid|cannot be before|only valid/i.test(message)) return 400;
  if (/closed|stopp|ready|waiting|unresolved|terminal|SLUTBEDÖMNING/i.test(message)) return 409;
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
    console.error('[salu/decision] flags failed', flagError);
    return NextResponse.json({ error: 'Kunde inte läsa SALU-beslutslistan' }, { status: 500 });
  }

  const flagIds = (flags ?? []).map((row) => row.flag_id);
  const regnrs = [...new Set((flags ?? []).map((row) => row.regnr))];

  const [checkpointResponse, childResponse, stateResponse] = await Promise.all([
    flagIds.length
      ? admin.from('salu_checkpoints').select('flag_id,status').in('flag_id', flagIds)
      : Promise.resolve({ data: [], error: null }),
    flagIds.length
      ? admin.from('salu_child_processes').select('flag_id,status').in('flag_id', flagIds)
      : Promise.resolve({ data: [], error: null }),
    regnrs.length
      ? admin.from('salu_vehicle_state').select('regnr,ny_date,original_saludatum,current_saludatum').in('regnr', regnrs)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const response of [checkpointResponse, childResponse, stateResponse]) {
    if (response.error) {
      console.error('[salu/decision] support data failed', response.error);
      return NextResponse.json({ error: 'Kunde inte läsa SALU-beslutsunderlaget' }, { status: 500 });
    }
  }

  const checkpoints = checkpointResponse.data ?? [];
  const children = childResponse.data ?? [];
  const states = new Map((stateResponse.data ?? []).map((row) => [row.regnr, row]));

  const data = (flags ?? []).map((flag) => {
    const waitingCheckpoints = checkpoints.filter((row) => row.flag_id === flag.flag_id && row.status === 'VÄNTAR').length;
    const openChildProcesses = children.filter(
      (row) => row.flag_id === flag.flag_id && !['VERIFIED', 'CANCELLED'].includes(row.status),
    ).length;

    return {
      ...flag,
      vehicle_state: states.get(flag.regnr) ?? null,
      blockers: {
        waiting_checkpoints: waitingCheckpoints,
        open_child_processes: openChildProcesses,
        ready: waitingCheckpoints === 0 && openChildProcesses === 0,
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
  const outcome = text(body.closure_outcome ?? body.closureOutcome);
  const comment = text(body.closure_comment ?? body.closureComment);
  const newSaludatum = text(body.new_saludatum ?? body.newSaludatum);

  if (!flagId) return NextResponse.json({ error: 'flag_id saknas' }, { status: 400 });
  if (!outcome) return NextResponse.json({ error: 'Slutbeslut saknas' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin.rpc('decide_salu_flag_v1', {
    p_flag_id: flagId,
    p_closure_outcome: outcome,
    p_closure_comment: comment,
    p_new_saludatum: newSaludatum,
    p_actor_id: verification.user.id,
  });

  if (error) {
    console.error('[salu/decision] decision failed', error);
    return NextResponse.json({ error: error.message || 'SALU-beslutet kunde inte sparas' }, { status: mapError(error.message || '') });
  }

  return NextResponse.json({ data });
}
