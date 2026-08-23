import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

type GenericRow = Record<string, unknown>;

type AttentionItem = {
  regnr: string;
  station: string | null;
  state: string | null;
  stateStartedAt: string | null;
  downtimeReason: string | null;
  attention: string[];
  ownerFunctions: string[];
  actionStatus: string | null;
  deadlineAt: string | null;
  overdue: boolean;
  waitingVerification: boolean;
  nextSteps: string[];
  links: { vagnkort: string };
};

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function dateText(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function nextActionStep(status: string | null): string | null {
  switch (status) {
    case 'CREATED': return 'Acceptera åtgärd';
    case 'ACCEPTED':
    case 'IN_PROGRESS': return 'Genomför åtgärd';
    case 'READY_FOR_VERIFICATION': return 'Verifiera åtgärd';
    default: return null;
  }
}

function nextHandoffStep(status: string | null): string | null {
  switch (status) {
    case 'REQUESTED': return 'Lämna över';
    case 'HANDED_OVER': return 'Kvittera mottagande';
    case 'RECEIVED': return 'Acceptera ansvar';
    case 'ACCEPTED': return 'Genomför uppdrag';
    case 'COMPLETED': return 'Verifiera handslag';
    default: return null;
  }
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[operator-cockpit] Missing server configuration:', error);
    return NextResponse.json({ error: 'Operator cockpit unavailable' }, { status: 503 });
  }

  try {
    const [periodsRes, checkpointsRes, checkpointDefsRes, actionsRes, handoffsRes, handoffDefsRes, saluRes, checkinsRes] = await Promise.all([
      admin.from('vehicle_journey_periods')
        .select('period_id,regnr,period_type,started_at,reason_code,reason_text,source_system,source_entity,source_record_id')
        .is('ended_at', null),
      admin.from('vehicle_checkpoints')
        .select('checkpoint_id,regnr,checkpoint_code,definition_version,status,due_at,created_at,updated_at'),
      admin.from('checkpoint_definitions')
        .select('checkpoint_code,definition_version,owner_function,blocking,title'),
      admin.from('checkpoint_actions')
        .select('action_id,checkpoint_id,title,owner_function,owner_ref,deadline_at,blocking,status,timer_status,overdue_at,escalated_at,ready_for_verification_at,created_at,updated_at'),
      admin.from('handoffs')
        .select('handoff_id,handoff_code,handoff_version,regnr,status,created_at,updated_at'),
      admin.from('handoff_definitions')
        .select('handoff_code,handoff_version,from_function,to_function,blocking,title'),
      admin.from('salu_flags')
        .select('flag_id,regnr,status,escalation_status,owner_function,current_saludatum,created_at')
        .neq('status', 'STÄNGD'),
      admin.from('checkins')
        .select('regnr,station,completed_at')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(5000),
    ]);

    const responses = [periodsRes, checkpointsRes, checkpointDefsRes, actionsRes, handoffsRes, handoffDefsRes, saluRes, checkinsRes];
    const failed = responses.find((response) => response.error);
    if (failed?.error) throw failed.error;

    const periods = (periodsRes.data ?? []) as GenericRow[];
    const checkpoints = (checkpointsRes.data ?? []) as GenericRow[];
    const checkpointDefs = (checkpointDefsRes.data ?? []) as GenericRow[];
    const actions = (actionsRes.data ?? []) as GenericRow[];
    const handoffs = (handoffsRes.data ?? []) as GenericRow[];
    const handoffDefs = (handoffDefsRes.data ?? []) as GenericRow[];
    const saluFlags = (saluRes.data ?? []) as GenericRow[];
    const checkins = (checkinsRes.data ?? []) as GenericRow[];

    const checkpointDefMap = new Map(
      checkpointDefs.map((row) => [`${row.checkpoint_code}:${row.definition_version}`, row]),
    );
    const checkpointMap = new Map(checkpoints.map((row) => [String(row.checkpoint_id), row]));
    const handoffDefMap = new Map(
      handoffDefs.map((row) => [`${row.handoff_code}:${row.handoff_version}`, row]),
    );

    const stationMap = new Map<string, string>();
    for (const row of checkins) {
      const regnr = text(row.regnr)?.toUpperCase();
      const station = text(row.station);
      if (regnr && station && !stationMap.has(regnr)) stationMap.set(regnr, station);
    }

    const openPeriodMap = new Map<string, GenericRow>();
    for (const row of periods) {
      const regnr = text(row.regnr)?.toUpperCase();
      if (!regnr) continue;
      const existing = openPeriodMap.get(regnr);
      if (!existing || Date.parse(String(row.started_at)) > Date.parse(String(existing.started_at))) {
        openPeriodMap.set(regnr, row);
      }
    }

    const unresolvedBlockingCheckpoints = checkpoints.filter((row) => {
      const definition = checkpointDefMap.get(`${row.checkpoint_code}:${row.definition_version}`);
      return definition?.blocking === true && (row.status === 'VANTAR' || row.status === 'AVVIKELSE');
    });

    const openActions = actions.filter((row) => row.status !== 'VERIFIED' && row.status !== 'CANCELLED');
    const openBlockingActions = openActions.filter((row) => row.blocking === true);
    const openHandoffs = handoffs.filter((row) => row.status !== 'VERIFIED' && row.status !== 'CANCELLED');
    const openBlockingHandoffs = openHandoffs.filter((row) => {
      const definition = handoffDefMap.get(`${row.handoff_code}:${row.handoff_version}`);
      return definition?.blocking === true;
    });
    const escalatedSalu = saluFlags.filter((row) => row.escalation_status === 'T10' || row.escalation_status === 'PASSERAD');

    const attentionRegnrs = new Set<string>();
    for (const row of periods) {
      if (row.period_type === 'DOWNTIME') {
        const regnr = text(row.regnr)?.toUpperCase();
        if (regnr) attentionRegnrs.add(regnr);
      }
    }
    for (const row of unresolvedBlockingCheckpoints) {
      const regnr = text(row.regnr)?.toUpperCase();
      if (regnr) attentionRegnrs.add(regnr);
    }
    for (const action of openBlockingActions) {
      const checkpoint = checkpointMap.get(String(action.checkpoint_id));
      const regnr = text(checkpoint?.regnr)?.toUpperCase();
      if (regnr) attentionRegnrs.add(regnr);
    }
    for (const row of openBlockingHandoffs) {
      const regnr = text(row.regnr)?.toUpperCase();
      if (regnr) attentionRegnrs.add(regnr);
    }
    for (const row of escalatedSalu) {
      const regnr = text(row.regnr)?.toUpperCase();
      if (regnr) attentionRegnrs.add(regnr);
    }

    const now = Date.now();
    const items: AttentionItem[] = [...attentionRegnrs].map((regnr) => {
      const period = openPeriodMap.get(regnr);
      const vehicleCheckpoints = unresolvedBlockingCheckpoints.filter((row) => text(row.regnr)?.toUpperCase() === regnr);
      const checkpointIds = new Set(vehicleCheckpoints.map((row) => String(row.checkpoint_id)));
      const vehicleActions = openActions.filter((row) => checkpointIds.has(String(row.checkpoint_id)));
      const vehicleHandoffs = openBlockingHandoffs.filter((row) => text(row.regnr)?.toUpperCase() === regnr);
      const vehicleSalu = escalatedSalu.find((row) => text(row.regnr)?.toUpperCase() === regnr);

      const deadlines = vehicleActions
        .map((row) => dateText(row.deadline_at))
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => Date.parse(a) - Date.parse(b));
      const earliestDeadline = deadlines[0] ?? null;
      const overdue = vehicleActions.some((row) => {
        const deadline = dateText(row.deadline_at);
        return Boolean(row.overdue_at || row.escalated_at || (deadline && Date.parse(deadline) < now));
      });
      const waitingVerification = vehicleActions.some((row) => row.status === 'READY_FOR_VERIFICATION')
        || vehicleHandoffs.some((row) => row.status === 'COMPLETED');

      const attention = unique([
        period?.period_type === 'DOWNTIME' ? 'DOWNTIME' : null,
        vehicleCheckpoints.length > 0 ? 'BLOCKERANDE_KONTROLLPUNKT' : null,
        vehicleActions.some((row) => row.blocking === true) ? 'BLOCKERANDE_ACTION' : null,
        vehicleHandoffs.length > 0 ? 'BLOCKERANDE_HANDSLAG' : null,
        overdue ? 'FÖRSENAD' : null,
        waitingVerification ? 'VÄNTAR_VERIFIERING' : null,
        vehicleSalu?.escalation_status === 'T10' ? 'SALU_T10' : null,
        vehicleSalu?.escalation_status === 'PASSERAD' ? 'SALU_PASSERAD' : null,
      ]);

      const ownerFunctions = unique([
        ...vehicleCheckpoints.map((row) => text(checkpointDefMap.get(`${row.checkpoint_code}:${row.definition_version}`)?.owner_function)),
        ...vehicleActions.map((row) => text(row.owner_function)),
        ...vehicleHandoffs.map((row) => text(handoffDefMap.get(`${row.handoff_code}:${row.handoff_version}`)?.to_function)),
        text(vehicleSalu?.owner_function),
      ]);

      const nextSteps = unique([
        ...vehicleActions.map((row) => nextActionStep(text(row.status))),
        ...vehicleHandoffs.map((row) => nextHandoffStep(text(row.status))),
        vehicleCheckpoints.length > 0 && vehicleActions.length === 0 ? 'Hantera blockerande kontrollpunkt' : null,
        vehicleSalu?.escalation_status === 'PASSERAD' ? 'Ta SALU-beslut' : null,
      ]);

      const actionStatuses = unique(vehicleActions.map((row) => text(row.status)));

      return {
        regnr,
        station: stationMap.get(regnr) ?? null,
        state: text(period?.period_type),
        stateStartedAt: dateText(period?.started_at),
        downtimeReason: period?.period_type === 'DOWNTIME'
          ? text(period.reason_text) ?? text(period.reason_code)
          : null,
        attention,
        ownerFunctions,
        actionStatus: actionStatuses.length === 1 ? actionStatuses[0] : actionStatuses.length > 1 ? 'FLERA' : null,
        deadlineAt: earliestDeadline,
        overdue,
        waitingVerification,
        nextSteps,
        links: { vagnkort: `/vagnkort?reg=${encodeURIComponent(regnr)}` },
      };
    });

    items.sort((a, b) => {
      const score = (item: AttentionItem) =>
        (item.overdue ? 100 : 0) +
        (item.waitingVerification ? 40 : 0) +
        (item.attention.includes('BLOCKERANDE_ACTION') ? 30 : 0) +
        (item.attention.includes('BLOCKERANDE_HANDSLAG') ? 25 : 0) +
        (item.attention.includes('DOWNTIME') ? 20 : 0) +
        (item.attention.includes('SALU_PASSERAD') ? 15 : 0);
      return score(b) - score(a) || a.regnr.localeCompare(b.regnr);
    });

    const stationFilter = new URL(request.url).searchParams.get('station')?.trim() || null;
    const filtered = stationFilter
      ? items.filter((item) => item.station?.toLowerCase() === stationFilter.toLowerCase())
      : items;

    return NextResponse.json({
      data: {
        generatedAt: new Date().toISOString(),
        perspective: 'OPERATIONS',
        stationFilter,
        summary: {
          attentionVehicles: filtered.length,
          downtime: filtered.filter((item) => item.attention.includes('DOWNTIME')).length,
          blocked: filtered.filter((item) => item.attention.some((value) => value.startsWith('BLOCKERANDE_'))).length,
          overdue: filtered.filter((item) => item.overdue).length,
          waitingVerification: filtered.filter((item) => item.waitingVerification).length,
        },
        items: filtered,
      },
    });
  } catch (error) {
    console.error('[operator-cockpit] Read failed:', error);
    return NextResponse.json({ error: 'Could not load operator cockpit' }, { status: 500 });
  }
}
