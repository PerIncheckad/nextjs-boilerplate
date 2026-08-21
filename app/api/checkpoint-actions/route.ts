import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TRANSITION_STATUSES = [
  'ACCEPTED',
  'IN_PROGRESS',
  'READY_FOR_VERIFICATION',
  'CANCELLED',
] as const;

const ACTION_OUTCOMES = [
  'ATGARDAD',
  'ACCEPTERAD_AVVIKELSE',
  'EJ_RELEVANT',
  'FORTSATT_AVVIKELSE',
] as const;

function cleanRegnr(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : '';
}

function cleanUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value.trim()) ? value.trim() : null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, maxLength);
}

function cleanTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function cleanEvidenceRefs(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) return undefined;

  const refs = value.map((entry) => {
    if (typeof entry !== 'string') return null;
    const cleaned = entry.trim().slice(0, 300);
    return cleaned || null;
  });

  return refs.some((entry) => entry === null) ? undefined : refs as string[];
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

async function checkpointBelongsToVehicle(
  admin: ReturnType<typeof createAdminClient>,
  checkpointId: string,
  regnr: string,
) {
  const { data, error } = await admin
    .from('vehicle_checkpoints')
    .select('checkpoint_id')
    .eq('checkpoint_id', checkpointId)
    .eq('regnr', regnr)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function actionBelongsToVehicle(
  admin: ReturnType<typeof createAdminClient>,
  actionId: string,
  regnr: string,
) {
  const { data: action, error: actionError } = await admin
    .from('checkpoint_actions')
    .select('checkpoint_id')
    .eq('action_id', actionId)
    .maybeSingle();

  if (actionError) throw actionError;
  if (!action) return false;

  return checkpointBelongsToVehicle(admin, action.checkpoint_id, regnr);
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === '22023') {
    return NextResponse.json({ error: error.message || 'Invalid action input' }, { status: 400 });
  }
  if (error.code === 'P0002') {
    return NextResponse.json({ error: error.message || 'Action context not found' }, { status: 404 });
  }
  if (error.code === 'P0001') {
    return NextResponse.json({ error: error.message || 'Action state conflict' }, { status: 409 });
  }
  return null;
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const regnr = cleanRegnr(body.regnr ?? body.reg);
  if (!REGNR_RE.test(regnr)) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action.trim().toUpperCase() : '';

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[checkpoint-actions] Missing server configuration:', error);
    return NextResponse.json({ error: 'Checkpoint actions unavailable' }, { status: 503 });
  }

  try {
    if (!(await vehicleExists(admin, regnr))) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    if (action === 'CREATE') {
      const checkpointId = cleanUuid(body.checkpointId);
      const title = cleanText(body.title, 200);
      const description = cleanText(body.description, 1000);
      const ownerFunction = cleanText(body.ownerFunction, 120);
      const ownerRef = cleanText(body.ownerRef, 200);
      const deadlineAt = cleanTimestamp(body.deadlineAt);
      const blocking = body.blocking === undefined ? true : body.blocking === true;

      if (!checkpointId) {
        return NextResponse.json({ error: 'Invalid checkpoint id' }, { status: 400 });
      }
      if (!(await checkpointBelongsToVehicle(admin, checkpointId, regnr))) {
        return NextResponse.json({ error: 'Checkpoint not found for vehicle' }, { status: 404 });
      }
      if (!title) {
        return NextResponse.json({ error: 'Action title is required' }, { status: 400 });
      }
      if (!ownerFunction) {
        return NextResponse.json({ error: 'Action owner function is required' }, { status: 400 });
      }
      if (!deadlineAt) {
        return NextResponse.json({ error: 'Valid action deadline is required' }, { status: 400 });
      }

      const { data, error } = await admin.rpc('create_checkpoint_action', {
        p_checkpoint_id: checkpointId,
        p_title: title,
        p_description: description,
        p_owner_function: ownerFunction,
        p_owner_ref: ownerRef,
        p_deadline_at: deadlineAt,
        p_blocking: blocking,
        p_actor_id: verification.user.id,
        p_actor_email: verification.user.email,
      });

      if (error) {
        const response = rpcErrorResponse(error);
        if (response) return response;
        throw error;
      }

      return NextResponse.json({ data }, { status: 201 });
    }

    if (action === 'TRANSITION') {
      const actionId = cleanUuid(body.actionId);
      const nextStatus = typeof body.nextStatus === 'string'
        ? body.nextStatus.trim().toUpperCase()
        : '';
      const comment = cleanText(body.comment, 1000);

      if (!actionId) {
        return NextResponse.json({ error: 'Invalid action id' }, { status: 400 });
      }
      if (!TRANSITION_STATUSES.includes(nextStatus as (typeof TRANSITION_STATUSES)[number])) {
        return NextResponse.json({ error: 'Invalid action transition status' }, { status: 400 });
      }
      if (!(await actionBelongsToVehicle(admin, actionId, regnr))) {
        return NextResponse.json({ error: 'Checkpoint action not found for vehicle' }, { status: 404 });
      }
      if (nextStatus === 'CANCELLED' && !comment) {
        return NextResponse.json({ error: 'Cancellation requires a reason' }, { status: 400 });
      }

      const { data, error } = await admin.rpc('transition_checkpoint_action', {
        p_action_id: actionId,
        p_next_status: nextStatus,
        p_comment: comment,
        p_actor_id: verification.user.id,
        p_actor_email: verification.user.email,
      });

      if (error) {
        const response = rpcErrorResponse(error);
        if (response) return response;
        throw error;
      }

      return NextResponse.json({ data });
    }

    if (action === 'VERIFY') {
      const actionId = cleanUuid(body.actionId);
      const outcome = typeof body.outcome === 'string' ? body.outcome.trim().toUpperCase() : '';
      const comment = cleanText(body.comment, 1000);
      const evidenceRefs = cleanEvidenceRefs(body.evidenceRefs);

      if (!actionId) {
        return NextResponse.json({ error: 'Invalid action id' }, { status: 400 });
      }
      if (!ACTION_OUTCOMES.includes(outcome as (typeof ACTION_OUTCOMES)[number])) {
        return NextResponse.json({ error: 'Invalid action outcome' }, { status: 400 });
      }
      if (!(await actionBelongsToVehicle(admin, actionId, regnr))) {
        return NextResponse.json({ error: 'Checkpoint action not found for vehicle' }, { status: 404 });
      }
      if (evidenceRefs === undefined) {
        return NextResponse.json({ error: 'Invalid evidence refs' }, { status: 400 });
      }
      if (
        (outcome === 'ACCEPTERAD_AVVIKELSE' || outcome === 'FORTSATT_AVVIKELSE')
        && !comment
      ) {
        return NextResponse.json({ error: 'Selected outcome requires a comment' }, { status: 400 });
      }

      const { data, error } = await admin.rpc('verify_checkpoint_action', {
        p_action_id: actionId,
        p_outcome: outcome,
        p_comment: comment,
        p_evidence_refs: evidenceRefs,
        p_actor_id: verification.user.id,
        p_actor_email: verification.user.email,
      });

      if (error) {
        const response = rpcErrorResponse(error);
        if (response) return response;
        throw error;
      }

      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[checkpoint-actions] Operation failed:', error);
    return NextResponse.json({ error: 'Checkpoint action operation failed' }, { status: 500 });
  }
}
