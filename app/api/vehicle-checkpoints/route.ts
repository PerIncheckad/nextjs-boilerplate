import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import { CHECKPOINT_STATUSES, validateCheckpointCode } from '@/lib/checkpoint-engine';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanRegnr(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : '';
}

function cleanOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, maxLength);
}

function cleanTimestamp(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function cleanEvidenceRefs(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) return undefined;

  const refs = value.map((entry) => {
    if (typeof entry !== 'string') return null;
    const cleaned = entry.trim().slice(0, 200);
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
  return [vehicle, nybil, checkin, salu].some((response) => (response.data?.length ?? 0) > 0);
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
    console.error('[vehicle-checkpoints] Missing server configuration:', error);
    return NextResponse.json({ error: 'Checkpoint engine unavailable' }, { status: 503 });
  }

  try {
    if (!(await vehicleExists(admin, regnr))) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    const { data: checkpoints, error } = await admin
      .from('vehicle_checkpoints')
      .select('checkpoint_id,checkpoint_code,definition_version,cycle_key,status,due_at,source_journey_event_id,source_context,created_at,updated_at')
      .eq('regnr', regnr)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const codes = [...new Set((checkpoints ?? []).map((row) => row.checkpoint_code as string))];
    const { data: definitions, error: definitionError } = codes.length === 0
      ? { data: [], error: null }
      : await admin
          .from('checkpoint_definitions')
          .select('checkpoint_code,definition_version,domain,title,description,owner_function,verification_mode,blocking')
          .in('checkpoint_code', codes);

    if (definitionError) throw definitionError;

    const definitionMap = new Map(
      (definitions ?? []).map((definition) => [
        `${definition.checkpoint_code}:${definition.definition_version}`,
        definition,
      ]),
    );

    return NextResponse.json({
      data: (checkpoints ?? []).map((checkpoint) => ({
        ...checkpoint,
        definition: definitionMap.get(`${checkpoint.checkpoint_code}:${checkpoint.definition_version}`) ?? null,
      })),
    });
  } catch (error) {
    console.error('[vehicle-checkpoints] Read failed:', error);
    return NextResponse.json({ error: 'Could not load checkpoints' }, { status: 500 });
  }
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

  const action = typeof body.action === 'string' ? body.action.trim().toUpperCase() : '';
  const regnr = cleanRegnr(body.regnr);
  if (!REGNR_RE.test(regnr)) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[vehicle-checkpoints] Missing server configuration:', error);
    return NextResponse.json({ error: 'Checkpoint engine unavailable' }, { status: 503 });
  }

  try {
    if (!(await vehicleExists(admin, regnr))) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    if (action === 'ENSURE') {
      let checkpointCode: string;
      try {
        checkpointCode = validateCheckpointCode(typeof body.checkpointCode === 'string' ? body.checkpointCode : '');
      } catch {
        return NextResponse.json({ error: 'Invalid checkpoint code' }, { status: 400 });
      }

      const cycleKey = cleanOptionalText(body.cycleKey, 120) ?? 'default';
      const dueAt = cleanTimestamp(body.dueAt);
      if (dueAt === undefined) {
        return NextResponse.json({ error: 'Invalid due time' }, { status: 400 });
      }

      const sourceJourneyEventId = typeof body.sourceJourneyEventId === 'string'
        && UUID_RE.test(body.sourceJourneyEventId.trim())
        ? body.sourceJourneyEventId.trim()
        : null;
      if (body.sourceJourneyEventId && !sourceJourneyEventId) {
        return NextResponse.json({ error: 'Invalid source journey event id' }, { status: 400 });
      }

      const sourceContext = body.sourceContext && typeof body.sourceContext === 'object' && !Array.isArray(body.sourceContext)
        ? body.sourceContext
        : {};

      const { data, error } = await admin.rpc('ensure_vehicle_checkpoint', {
        p_regnr: regnr,
        p_checkpoint_code: checkpointCode,
        p_cycle_key: cycleKey,
        p_due_at: dueAt,
        p_source_journey_event_id: sourceJourneyEventId,
        p_source_context: sourceContext,
        p_actor_id: verification.user.id,
        p_actor_email: verification.user.email,
      });

      if (error) {
        if (error.code === 'P0002') {
          return NextResponse.json({ error: 'Active checkpoint definition not found' }, { status: 404 });
        }
        throw error;
      }

      return NextResponse.json({ data }, { status: data?.created ? 201 : 200 });
    }

    if (action === 'ASSESS') {
      const checkpointId = typeof body.checkpointId === 'string' && UUID_RE.test(body.checkpointId.trim())
        ? body.checkpointId.trim()
        : null;
      if (!checkpointId) {
        return NextResponse.json({ error: 'Invalid checkpoint id' }, { status: 400 });
      }

      const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';
      if (!CHECKPOINT_STATUSES.includes(status as (typeof CHECKPOINT_STATUSES)[number]) || status === 'VANTAR') {
        return NextResponse.json({ error: 'Invalid assessment status' }, { status: 400 });
      }

      const comment = cleanOptionalText(body.comment, 1000);
      if (status === 'AVVIKELSE' && !comment) {
        return NextResponse.json({ error: 'Deviation requires a comment' }, { status: 400 });
      }

      const evidenceRefs = cleanEvidenceRefs(body.evidenceRefs);
      if (evidenceRefs === undefined) {
        return NextResponse.json({ error: 'Invalid evidence refs' }, { status: 400 });
      }

      const { data: checkpoint, error: checkpointError } = await admin
        .from('vehicle_checkpoints')
        .select('checkpoint_id')
        .eq('checkpoint_id', checkpointId)
        .eq('regnr', regnr)
        .maybeSingle();
      if (checkpointError) throw checkpointError;
      if (!checkpoint) {
        return NextResponse.json({ error: 'Checkpoint not found for vehicle' }, { status: 404 });
      }

      const { data, error } = await admin.rpc('assess_vehicle_checkpoint', {
        p_checkpoint_id: checkpointId,
        p_status: status,
        p_comment: comment,
        p_evidence_refs: evidenceRefs,
        p_actor_id: verification.user.id,
        p_actor_email: verification.user.email,
        p_actor_source: 'MANUELL',
      });

      if (error) {
        if (error.code === '22023') {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (error.code === 'P0002') {
          return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
        }
        throw error;
      }

      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[vehicle-checkpoints] Write failed:', error);
    return NextResponse.json({ error: 'Checkpoint operation failed' }, { status: 500 });
  }
}
