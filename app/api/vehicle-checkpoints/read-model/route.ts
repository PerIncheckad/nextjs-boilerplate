import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;

function cleanRegnr(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function checkpointIdFromPayload(payload: unknown): string | null {
  return stringValue(asRecord(payload)?.checkpointId);
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
    console.error('[vehicle-checkpoint-read-model] Missing server configuration:', error);
    return NextResponse.json({ error: 'Checkpoint engine unavailable' }, { status: 503 });
  }

  try {
    if (!(await vehicleExists(admin, regnr))) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    const { data: checkpoints, error: checkpointError } = await admin
      .from('vehicle_checkpoints')
      .select('checkpoint_id,checkpoint_code,definition_version,cycle_key,status,due_at,source_journey_event_id,source_context,created_at,updated_at')
      .eq('regnr', regnr)
      .order('created_at', { ascending: false });

    if (checkpointError) throw checkpointError;

    const checkpointRows = checkpoints ?? [];
    if (checkpointRows.length === 0) {
      return NextResponse.json({
        data: {
          regnr,
          summary: {
            total: 0,
            approved: 0,
            waiting: 0,
            deviations: 0,
            notRelevant: 0,
            blocking: 0,
            unresolvedBlocking: 0,
            verifiedOutcomes: 0,
          },
          checkpoints: [],
        },
      });
    }

    const checkpointIds = checkpointRows.map((row) => row.checkpoint_id as string);
    const checkpointCodes = [...new Set(checkpointRows.map((row) => row.checkpoint_code as string))];
    const linkedEventIds = checkpointRows
      .map((row) => row.source_journey_event_id as string | null)
      .filter((eventId): eventId is string => Boolean(eventId));

    const [definitionResponse, assessmentResponse, checkpointEventResponse, linkedEventResponse] = await Promise.all([
      admin
        .from('checkpoint_definitions')
        .select('checkpoint_code,definition_version,domain,title,description,owner_function,verification_mode,blocking')
        .in('checkpoint_code', checkpointCodes),
      admin
        .from('checkpoint_assessments')
        .select('assessment_id,checkpoint_id,previous_status,status,comment,evidence_refs,actor_id,actor_email,actor_source,assessed_at,metadata')
        .in('checkpoint_id', checkpointIds)
        .order('assessed_at', { ascending: false }),
      admin
        .from('vehicle_journey_events')
        .select('event_id,event_type,occurred_at,source_system,source_entity,source_record_id,actor_source,actor_name,actor_email,payload')
        .eq('regnr', regnr)
        .eq('source_system', 'CHECKPOINT_ENGINE')
        .in('event_type', ['CHECKPOINT_CREATED', 'CHECKPOINT_ASSESSED'])
        .order('occurred_at', { ascending: false }),
      linkedEventIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : admin
            .from('vehicle_journey_events')
            .select('event_id,event_type,occurred_at,source_system,source_entity,source_record_id,actor_source,actor_name,actor_email,payload')
            .in('event_id', linkedEventIds),
    ]);

    const failed = [
      ['definitions', definitionResponse.error],
      ['assessments', assessmentResponse.error],
      ['checkpoint events', checkpointEventResponse.error],
      ['linked source events', linkedEventResponse.error],
    ].find(([, error]) => error);
    if (failed?.[1]) {
      console.error(`[vehicle-checkpoint-read-model] ${failed[0]} query failed:`, failed[1]);
      throw failed[1];
    }

    const definitionMap = new Map(
      (definitionResponse.data ?? []).map((definition) => [
        `${definition.checkpoint_code}:${definition.definition_version}`,
        definition,
      ]),
    );

    const assessmentMap = new Map<string, (typeof assessmentResponse.data extends Array<infer T> ? T : never)>();
    for (const assessment of assessmentResponse.data ?? []) {
      const checkpointId = assessment.checkpoint_id as string;
      if (!assessmentMap.has(checkpointId)) assessmentMap.set(checkpointId, assessment);
    }

    const checkpointEventMap = new Map<string, {
      created: (typeof checkpointEventResponse.data extends Array<infer T> ? T : never) | null;
      assessed: (typeof checkpointEventResponse.data extends Array<infer T> ? T : never) | null;
    }>();

    for (const event of checkpointEventResponse.data ?? []) {
      const checkpointId = checkpointIdFromPayload(event.payload);
      if (!checkpointId) continue;
      const existing = checkpointEventMap.get(checkpointId) ?? { created: null, assessed: null };
      if (event.event_type === 'CHECKPOINT_CREATED' && !existing.created) existing.created = event;
      if (event.event_type === 'CHECKPOINT_ASSESSED' && !existing.assessed) existing.assessed = event;
      checkpointEventMap.set(checkpointId, existing);
    }

    const linkedEventMap = new Map(
      (linkedEventResponse.data ?? []).map((event) => [event.event_id as string, event]),
    );

    const enriched = checkpointRows.map((checkpoint) => {
      const definition = definitionMap.get(`${checkpoint.checkpoint_code}:${checkpoint.definition_version}`) ?? null;
      const latestAssessment = assessmentMap.get(checkpoint.checkpoint_id as string) ?? null;
      const checkpointEvents = checkpointEventMap.get(checkpoint.checkpoint_id as string) ?? {
        created: null,
        assessed: null,
      };
      const sourceContext = asRecord(checkpoint.source_context) ?? {};

      return {
        ...checkpoint,
        definition,
        latestAssessment,
        source: {
          kind: stringValue(sourceContext.sourceKind),
          entity: stringValue(sourceContext.sourceEntity),
          recordId: stringValue(sourceContext.sourceRecordId),
          occurredAt: stringValue(sourceContext.occurredAt),
          status: stringValue(sourceContext.sourceStatus),
          context: sourceContext,
          linkedJourneyEvent: checkpoint.source_journey_event_id
            ? linkedEventMap.get(checkpoint.source_journey_event_id as string) ?? null
            : null,
        },
        checkpointEvents,
      };
    });

    const summary = enriched.reduce((totals, checkpoint) => {
      totals.total += 1;
      if (checkpoint.status === 'GODKAND') totals.approved += 1;
      if (checkpoint.status === 'VANTAR') totals.waiting += 1;
      if (checkpoint.status === 'AVVIKELSE') totals.deviations += 1;
      if (checkpoint.status === 'EJ_RELEVANT') totals.notRelevant += 1;
      if (checkpoint.latestAssessment) totals.verifiedOutcomes += 1;
      if (checkpoint.definition?.blocking) {
        totals.blocking += 1;
        if (checkpoint.status === 'VANTAR' || checkpoint.status === 'AVVIKELSE') {
          totals.unresolvedBlocking += 1;
        }
      }
      return totals;
    }, {
      total: 0,
      approved: 0,
      waiting: 0,
      deviations: 0,
      notRelevant: 0,
      blocking: 0,
      unresolvedBlocking: 0,
      verifiedOutcomes: 0,
    });

    return NextResponse.json({ data: { regnr, summary, checkpoints: enriched } });
  } catch (error) {
    console.error('[vehicle-checkpoint-read-model] Read failed:', error);
    return NextResponse.json({ error: 'Could not load checkpoint read model' }, { status: 500 });
  }
}
