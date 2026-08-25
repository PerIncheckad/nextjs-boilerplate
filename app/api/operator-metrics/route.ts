import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

type GenericRow = Record<string, unknown>;

const ALLOWED_WINDOWS = new Set([24, 72, 168]);

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hoursBetween(start: unknown, end: unknown): number | null {
  const startDate = asDate(start);
  const endDate = asDate(end);
  if (!startDate || !endDate) return null;
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / 3_600_000);
}

function rounded(value: number | null): number | null {
  return value == null ? null : Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function groupCount(rows: GenericRow[], key: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = typeof row[key] === 'string' && row[key] ? String(row[key]) : 'UNKNOWN';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const requestedWindow = Number(new URL(request.url).searchParams.get('hours') ?? '168');
  const hours = ALLOWED_WINDOWS.has(requestedWindow) ? requestedWindow : 168;
  const now = new Date();
  const since = new Date(now.getTime() - hours * 3_600_000).toISOString();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[operator-metrics] Missing server configuration:', error);
    return NextResponse.json({ error: 'Operator metrics unavailable' }, { status: 503 });
  }

  try {
    const [periodsRes, handoffsRes, actionsRes, checkpointsRes] = await Promise.all([
      admin.from('vehicle_journey_periods')
        .select('period_type,started_at,ended_at,reason_code')
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(5000),
      admin.from('handoffs')
        .select('handoff_code,status,created_at,handed_over_at,received_at,accepted_at,completed_at,verified_at,cancelled_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000),
      admin.from('checkpoint_actions')
        .select('status,created_at,accepted_at,ready_for_verification_at,verified_at,cancelled_at,deadline_at,blocking')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000),
      admin.from('vehicle_checkpoints')
        .select('checkpoint_code,status,created_at,updated_at,blocking')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000),
    ]);

    const failed = [periodsRes, handoffsRes, actionsRes, checkpointsRes].find((response) => response.error);
    if (failed?.error) throw failed.error;

    const periods = (periodsRes.data ?? []) as GenericRow[];
    const handoffs = (handoffsRes.data ?? []) as GenericRow[];
    const actions = (actionsRes.data ?? []) as GenericRow[];
    const checkpoints = (checkpointsRes.data ?? []) as GenericRow[];

    const periodHours = periods
      .map((row) => hoursBetween(row.started_at, row.ended_at ?? now.toISOString()))
      .filter((value): value is number => value != null);
    const closedPeriodHours = periods
      .filter((row) => row.ended_at)
      .map((row) => hoursBetween(row.started_at, row.ended_at))
      .filter((value): value is number => value != null);
    const downtimeRows = periods.filter((row) => row.period_type === 'DOWNTIME');
    const downtimeHours = downtimeRows
      .map((row) => hoursBetween(row.started_at, row.ended_at ?? now.toISOString()))
      .filter((value): value is number => value != null);

    const handoffAges = handoffs
      .map((row) => hoursBetween(row.created_at, row.verified_at ?? row.cancelled_at ?? now.toISOString()))
      .filter((value): value is number => value != null);
    const verifiedHandoffDurations = handoffs
      .filter((row) => row.status === 'VERIFIED')
      .map((row) => hoursBetween(row.created_at, row.verified_at))
      .filter((value): value is number => value != null);

    const actionAges = actions
      .map((row) => hoursBetween(row.created_at, row.verified_at ?? row.cancelled_at ?? now.toISOString()))
      .filter((value): value is number => value != null);
    const verifiedActionDurations = actions
      .filter((row) => row.status === 'VERIFIED')
      .map((row) => hoursBetween(row.created_at, row.verified_at))
      .filter((value): value is number => value != null);

    const overdueActions = actions.filter((row) => {
      if (row.status === 'VERIFIED' || row.status === 'CANCELLED') return false;
      const deadline = asDate(row.deadline_at);
      return deadline ? deadline.getTime() < now.getTime() : false;
    }).length;

    const openHandoffs = handoffs.filter((row) => row.status !== 'VERIFIED' && row.status !== 'CANCELLED').length;
    const openActions = actions.filter((row) => row.status !== 'VERIFIED' && row.status !== 'CANCELLED').length;
    const deviations = checkpoints.filter((row) => row.status === 'AVVIKELSE').length;
    const waiting = checkpoints.filter((row) => row.status === 'VANTAR').length;

    const sample = {
      periods: periods.length,
      closedPeriods: periods.filter((row) => Boolean(row.ended_at)).length,
      downtimePeriods: downtimeRows.length,
      handoffs: handoffs.length,
      verifiedHandoffs: handoffs.filter((row) => row.status === 'VERIFIED').length,
      actions: actions.length,
      verifiedActions: actions.filter((row) => row.status === 'VERIFIED').length,
      checkpoints: checkpoints.length,
    };

    return NextResponse.json({
      data: {
        generatedAt: now.toISOString(),
        hours,
        since,
        sample,
        operational: {
          openHandoffs,
          openActions,
          overdueActions,
          deviations,
          waitingCheckpoints: waiting,
        },
        leadTimes: {
          handoffAgeAvgHours: rounded(average(handoffAges)),
          handoffAgeMedianHours: rounded(median(handoffAges)),
          verifiedHandoffAvgHours: rounded(average(verifiedHandoffDurations)),
          actionAgeAvgHours: rounded(average(actionAges)),
          actionAgeMedianHours: rounded(median(actionAges)),
          verifiedActionAvgHours: rounded(average(verifiedActionDurations)),
          closedPeriodAvgHours: rounded(average(closedPeriodHours)),
          closedPeriodMedianHours: rounded(median(closedPeriodHours)),
          periodObservedAvgHours: rounded(average(periodHours)),
          downtimeObservedAvgHours: rounded(average(downtimeHours)),
        },
        breakdowns: {
          periodTypes: groupCount(periods, 'period_type'),
          handoffStatuses: groupCount(handoffs, 'status'),
          actionStatuses: groupCount(actions, 'status'),
          checkpointStatuses: groupCount(checkpoints, 'status'),
        },
        interpretation: {
          minimumReliableSample: 10,
          handoffLeadTimeReliable: verifiedHandoffDurations.length >= 10,
          actionLeadTimeReliable: verifiedActionDurations.length >= 10,
          downtimeLeadTimeReliable: downtimeRows.filter((row) => row.ended_at).length >= 10,
        },
      },
    });
  } catch (error) {
    console.error('[operator-metrics] Read failed:', error);
    return NextResponse.json({ error: 'Could not load operator metrics' }, { status: 500 });
  }
}
