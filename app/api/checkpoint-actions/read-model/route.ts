import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;

type CheckpointRow = {
  checkpoint_id: string;
  checkpoint_code: string;
  definition_version: number;
  status: string;
};

type ActionRow = {
  action_id: string;
  checkpoint_id: string;
  source_assessment_id: string;
  title: string;
  description: string | null;
  owner_function: string;
  owner_ref: string | null;
  deadline_at: string;
  blocking: boolean;
  status: string;
  outcome: string | null;
  outcome_comment: string | null;
  verification_assessment_id: string | null;
  created_by_email: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_for_verification_at: string | null;
  verified_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  updated_by_email: string | null;
  updated_at: string;
};

type ActionEventRow = {
  action_event_id: string;
  action_id: string;
  checkpoint_id: string;
  event_type: string;
  previous_status: string | null;
  status: string;
  comment: string | null;
  actor_email: string | null;
  actor_source: string;
  occurred_at: string;
  payload: unknown;
};

function cleanRegnr(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : '';
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function vehicleExists(admin: ReturnType<typeof createAdminClient>, regnr: string) {
  const [vehicle, nybil, checkin, salu] = await Promise.all([
    admin.from('vehicles').select('regnr').eq('regnr', regnr).limit(1),
    admin.from('nybil_inventering').select('regnr').eq('regnr', regnr).limit(1),
    admin.from('checkins').select('regnr').eq('regnr', regnr).limit(1),
    admin.from('salu_vehicle_state').select('regnr').eq('regnr', regnr).limit(1),
  ]);

  const failed = [vehicle, nybil, checkin, salu].find((response) => response.error);
  if (failed?.error) throw failed.error;

  return [vehicle, nybil, checkin, salu]
    .some((response) => (response.data?.length ?? 0) > 0);
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const regnr = cleanRegnr(new URL(request.url).searchParams.get('reg'));
  if (!REGNR_RE.test(regnr)) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[checkpoint-action-read-model] Missing server configuration:', error);
    return NextResponse.json({ error: 'Checkpoint actions unavailable' }, { status: 503 });
  }

  try {
    if (!(await vehicleExists(admin, regnr))) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    const { data: checkpointData, error: checkpointError } = await admin
      .from('vehicle_checkpoints')
      .select('checkpoint_id,checkpoint_code,definition_version,status')
      .eq('regnr', regnr);

    if (checkpointError) throw checkpointError;

    const checkpoints = (checkpointData ?? []) as CheckpointRow[];
    if (checkpoints.length === 0) {
      return NextResponse.json({
        data: {
          regnr,
          summary: {
            total: 0,
            open: 0,
            overdue: 0,
            blockingOpen: 0,
            readyForVerification: 0,
            verified: 0,
            cancelled: 0,
          },
          actions: [],
        },
      });
    }

    const checkpointIds = checkpoints.map((checkpoint) => checkpoint.checkpoint_id);
    const checkpointCodes = [...new Set(checkpoints.map((checkpoint) => checkpoint.checkpoint_code))];

    const [actionResponse, definitionResponse] = await Promise.all([
      admin
        .from('checkpoint_actions')
        .select('action_id,checkpoint_id,source_assessment_id,title,description,owner_function,owner_ref,deadline_at,blocking,status,outcome,outcome_comment,verification_assessment_id,created_by_email,created_at,accepted_at,ready_for_verification_at,verified_at,cancelled_at,cancel_reason,updated_by_email,updated_at')
        .in('checkpoint_id', checkpointIds)
        .order('created_at', { ascending: false }),
      admin
        .from('checkpoint_definitions')
        .select('checkpoint_code,definition_version,domain,title,owner_function,blocking')
        .in('checkpoint_code', checkpointCodes),
    ]);

    if (actionResponse.error) throw actionResponse.error;
    if (definitionResponse.error) throw definitionResponse.error;

    const actions = (actionResponse.data ?? []) as ActionRow[];
    const actionIds = actions.map((action) => action.action_id);

    const { data: eventData, error: eventError } = actionIds.length === 0
      ? { data: [], error: null }
      : await admin
          .from('checkpoint_action_events')
          .select('action_event_id,action_id,checkpoint_id,event_type,previous_status,status,comment,actor_email,actor_source,occurred_at,payload')
          .in('action_id', actionIds)
          .order('occurred_at', { ascending: false });

    if (eventError) throw eventError;

    const checkpointMap = new Map(
      checkpoints.map((checkpoint) => [checkpoint.checkpoint_id, checkpoint]),
    );
    const definitionMap = new Map(
      (definitionResponse.data ?? []).map((definition) => [
        `${definition.checkpoint_code}:${definition.definition_version}`,
        definition,
      ]),
    );

    const eventsByAction = new Map<string, ActionEventRow[]>();
    for (const event of (eventData ?? []) as ActionEventRow[]) {
      const existing = eventsByAction.get(event.action_id) ?? [];
      existing.push(event);
      eventsByAction.set(event.action_id, existing);
    }

    const now = Date.now();
    const enriched = actions.map((action) => {
      const checkpoint = checkpointMap.get(action.checkpoint_id) ?? null;
      const definition = checkpoint
        ? definitionMap.get(`${checkpoint.checkpoint_code}:${checkpoint.definition_version}`) ?? null
        : null;
      const terminal = action.status === 'VERIFIED' || action.status === 'CANCELLED';
      const deadline = new Date(action.deadline_at).getTime();

      return {
        ...action,
        overdue: !terminal && Number.isFinite(deadline) && deadline < now,
        checkpoint: checkpoint
          ? {
              ...checkpoint,
              definition,
            }
          : null,
        events: eventsByAction.get(action.action_id) ?? [],
      };
    });

    const summary = enriched.reduce((totals, action) => {
      totals.total += 1;
      if (action.status === 'VERIFIED') totals.verified += 1;
      if (action.status === 'CANCELLED') totals.cancelled += 1;
      if (action.status === 'READY_FOR_VERIFICATION') totals.readyForVerification += 1;
      if (action.overdue) totals.overdue += 1;
      if (action.status !== 'VERIFIED' && action.status !== 'CANCELLED') {
        totals.open += 1;
        if (action.blocking) totals.blockingOpen += 1;
      }
      return totals;
    }, {
      total: 0,
      open: 0,
      overdue: 0,
      blockingOpen: 0,
      readyForVerification: 0,
      verified: 0,
      cancelled: 0,
    });

    return NextResponse.json({ data: { regnr, summary, actions: enriched } });
  } catch (error) {
    console.error('[checkpoint-action-read-model] Read failed:', error);
    return NextResponse.json({ error: 'Could not load checkpoint actions' }, { status: 500 });
  }
}
