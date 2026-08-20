import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { evaluateSaluTriggers } from '@/lib/salu-trigger-engine';
import type { SaluEscalationStatus } from '@/lib/salu-core';

type VehicleStateRow = {
  regnr: string;
  current_saludatum: string | null;
};

type ActiveFlagRow = {
  flag_id: string;
  regnr: string;
  escalation_status: SaluEscalationStatus;
  created_at: string;
};

type EventKeyRow = {
  regnr: string;
  event_key: string | null;
};

type SchedulerAction = {
  regnr: string;
  saludatum: string;
  type:
    | 'SALU_FLAG_CREATED'
    | 'SALU_DECISION_REMINDER_DUE'
    | 'SALU_T10_ESCALATED'
    | 'SALU_T0_PASSED';
  eventKey: string;
};

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase server configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isAuthorized(request: Request): boolean {
  const authorization = request.headers.get('authorization');
  const tokens = [process.env.SALU_SCHEDULER_TOKEN, process.env.CRON_SECRET].filter(
    (token): token is string => Boolean(token),
  );
  return tokens.some((token) => authorization === `Bearer ${token}`);
}

export async function POST(request: Request) {
  if (process.env.SALU_SCHEDULER_ENABLED !== 'true') {
    return NextResponse.json({ error: 'SALU scheduler is not enabled' }, { status: 503 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true' || process.env.SALU_WRITES_ENABLED !== 'true';
  const today = url.searchParams.get('date') ?? utcToday();
  const admin = createAdminClient();

  const [statesResult, flagsResult, eventsResult] = await Promise.all([
    admin
      .from('salu_vehicle_state')
      .select('regnr,current_saludatum')
      .not('current_saludatum', 'is', null),
    admin
      .from('salu_flags')
      .select('flag_id,regnr,escalation_status,created_at')
      .neq('status', 'STÄNGD'),
    admin
      .from('salu_events')
      .select('regnr,event_key')
      .not('event_key', 'is', null),
  ]);

  if (statesResult.error || flagsResult.error || eventsResult.error) {
    console.error('[SALU scheduler] Failed to load scheduler state', {
      statesError: statesResult.error,
      flagsError: flagsResult.error,
      eventsError: eventsResult.error,
    });
    return NextResponse.json({ error: 'Failed to load SALU scheduler state' }, { status: 500 });
  }

  const states = (statesResult.data ?? []) as VehicleStateRow[];
  const flags = (flagsResult.data ?? []) as ActiveFlagRow[];
  const events = (eventsResult.data ?? []) as EventKeyRow[];

  const flagsByRegnr = new Map(flags.map((flag) => [flag.regnr, flag]));
  const eventKeysByRegnr = new Map<string, Set<string>>();
  for (const event of events) {
    if (!event.event_key) continue;
    const set = eventKeysByRegnr.get(event.regnr) ?? new Set<string>();
    set.add(event.event_key);
    eventKeysByRegnr.set(event.regnr, set);
  }

  const actions: SchedulerAction[] = [];
  const catchUpRequired: Array<{ regnr: string; saludatum: string }> = [];

  for (const state of states) {
    if (!state.current_saludatum) continue;
    const activeFlag = flagsByRegnr.get(state.regnr);
    const evaluation = evaluateSaluTriggers({
      today,
      saludatum: state.current_saludatum,
      hasActiveFlag: Boolean(activeFlag),
      activeFlagId: activeFlag?.flag_id,
      activeFlagCreatedDate: activeFlag?.created_at.slice(0, 10),
      activeFlagEscalation: activeFlag?.escalation_status,
      emittedEventKeys: eventKeysByRegnr.get(state.regnr),
    });

    if (evaluation.requiresCatchUpPolicy) {
      catchUpRequired.push({ regnr: state.regnr, saludatum: state.current_saludatum });
    }

    for (const action of evaluation.actions) {
      actions.push({
        regnr: state.regnr,
        saludatum: action.saludatum,
        type: action.type,
        eventKey: action.eventKey,
      });
    }
  }

  const applied: SchedulerAction[] = [];
  if (!dryRun) {
    for (const action of actions) {
      const { data, error } = await admin.rpc('apply_salu_trigger_action', {
        p_regnr: action.regnr,
        p_saludatum: action.saludatum,
        p_event_type: action.type,
        p_event_key: action.eventKey,
      });

      if (error) {
        console.error('[SALU scheduler] Failed to apply trigger action', { action, error });
        return NextResponse.json(
          { error: 'Failed to apply SALU trigger action', action },
          { status: 500 },
        );
      }

      if (Array.isArray(data) && data[0]?.applied === true) {
        applied.push(action);
      }
    }
  }

  return NextResponse.json({
    data: {
      date: today,
      dryRun,
      evaluatedVehicles: states.length,
      actions,
      applied,
      catchUpRequired,
    },
  });
}

export const GET = POST;
