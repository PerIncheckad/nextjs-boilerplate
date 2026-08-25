import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

type GenericRow = Record<string, unknown>;

type DriftEvent = {
  occurredAt: string;
  regnr: string | null;
  source: 'VEHICLE_JOURNEY' | 'CHECKPOINT_ACTION' | 'HANDOFF';
  eventType: string;
  status: string | null;
  checkpointCode: string | null;
  sourceSystem: string | null;
  sourceEntity: string | null;
  actorSource: string | null;
};

const ALLOWED_WINDOWS = new Set([24, 72, 168]);

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

function jsonObject(value: unknown): GenericRow {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as GenericRow : {};
}

function iso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const requestedWindow = Number(new URL(request.url).searchParams.get('hours') ?? '24');
  const hours = ALLOWED_WINDOWS.has(requestedWindow) ? requestedWindow : 24;
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[operator-history] Missing server configuration:', error);
    return NextResponse.json({ error: 'Operator history unavailable' }, { status: 503 });
  }

  try {
    const [journeyRes, actionEventsRes, handoffEventsRes] = await Promise.all([
      admin.from('vehicle_journey_events')
        .select('regnr,event_type,occurred_at,source_system,source_entity,actor_source,payload')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(1500),
      admin.from('checkpoint_action_events')
        .select('event_type,status,occurred_at,actor_source,checkpoint_id')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(1000),
      admin.from('handoff_events')
        .select('event_type,status,occurred_at,actor_source,handoff_id')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(1000),
    ]);

    const failed = [journeyRes, actionEventsRes, handoffEventsRes].find((response) => response.error);
    if (failed?.error) throw failed.error;

    const actionEvents = (actionEventsRes.data ?? []) as GenericRow[];
    const handoffEvents = (handoffEventsRes.data ?? []) as GenericRow[];
    const checkpointIds = [...new Set(actionEvents.map((row) => text(row.checkpoint_id)).filter((value): value is string => Boolean(value)))];
    const handoffIds = [...new Set(handoffEvents.map((row) => text(row.handoff_id)).filter((value): value is string => Boolean(value)))];

    const [checkpointsRes, handoffsRes] = await Promise.all([
      checkpointIds.length
        ? admin.from('vehicle_checkpoints').select('checkpoint_id,regnr,checkpoint_code').in('checkpoint_id', checkpointIds)
        : Promise.resolve({ data: [], error: null }),
      handoffIds.length
        ? admin.from('handoffs').select('handoff_id,regnr,handoff_code').in('handoff_id', handoffIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const relationFailure = [checkpointsRes, handoffsRes].find((response) => response.error);
    if (relationFailure?.error) throw relationFailure.error;

    const checkpointMap = new Map(
      ((checkpointsRes.data ?? []) as GenericRow[]).map((row) => [String(row.checkpoint_id), row]),
    );
    const handoffMap = new Map(
      ((handoffsRes.data ?? []) as GenericRow[]).map((row) => [String(row.handoff_id), row]),
    );

    const events: DriftEvent[] = [];

    for (const row of (journeyRes.data ?? []) as GenericRow[]) {
      const occurredAt = iso(row.occurred_at);
      if (!occurredAt) continue;
      const payload = jsonObject(row.payload);
      events.push({
        occurredAt,
        regnr: text(row.regnr)?.toUpperCase() ?? null,
        source: 'VEHICLE_JOURNEY',
        eventType: text(row.event_type) ?? 'UNKNOWN',
        status: text(payload.status) ?? text(payload.periodType),
        checkpointCode: text(payload.checkpointCode),
        sourceSystem: text(row.source_system),
        sourceEntity: text(row.source_entity),
        actorSource: text(row.actor_source),
      });
    }

    for (const row of actionEvents) {
      const occurredAt = iso(row.occurred_at);
      if (!occurredAt) continue;
      const checkpoint = checkpointMap.get(String(row.checkpoint_id)) ?? {};
      events.push({
        occurredAt,
        regnr: text(checkpoint.regnr)?.toUpperCase() ?? null,
        source: 'CHECKPOINT_ACTION',
        eventType: text(row.event_type) ?? 'UNKNOWN',
        status: text(row.status),
        checkpointCode: text(checkpoint.checkpoint_code),
        sourceSystem: 'CHECKPOINT_ENGINE',
        sourceEntity: 'checkpoint_action_events',
        actorSource: text(row.actor_source),
      });
    }

    for (const row of handoffEvents) {
      const occurredAt = iso(row.occurred_at);
      if (!occurredAt) continue;
      const handoff = handoffMap.get(String(row.handoff_id)) ?? {};
      events.push({
        occurredAt,
        regnr: text(handoff.regnr)?.toUpperCase() ?? null,
        source: 'HANDOFF',
        eventType: text(row.event_type) ?? 'UNKNOWN',
        status: text(row.status),
        checkpointCode: text(handoff.handoff_code),
        sourceSystem: 'PROCESS_ENGINE',
        sourceEntity: 'handoff_events',
        actorSource: text(row.actor_source),
      });
    }

    events.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

    const byType = new Map<string, number>();
    const vehicles = new Set<string>();
    let manualEvents = 0;
    let systemEvents = 0;
    for (const event of events) {
      byType.set(event.eventType, (byType.get(event.eventType) ?? 0) + 1);
      if (event.regnr) vehicles.add(event.regnr);
      if (event.actorSource === 'MANUELL') manualEvents += 1;
      if (event.actorSource === 'SYSTEM') systemEvents += 1;
    }

    return NextResponse.json({
      data: {
        generatedAt: new Date().toISOString(),
        hours,
        since,
        summary: {
          events: events.length,
          vehicles: vehicles.size,
          manualEvents,
          systemEvents,
          handoffEvents: events.filter((event) => event.source === 'HANDOFF').length,
          actionEvents: events.filter((event) => event.source === 'CHECKPOINT_ACTION').length,
        },
        eventTypes: [...byType.entries()]
          .map(([eventType, count]) => ({ eventType, count }))
          .sort((a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType)),
        events: events.slice(0, 500),
      },
    });
  } catch (error) {
    console.error('[operator-history] Read failed:', error);
    return NextResponse.json({ error: 'Could not load operator history' }, { status: 500 });
  }
}
