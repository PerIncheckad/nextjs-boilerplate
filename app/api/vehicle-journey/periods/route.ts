import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRIMARY_PERIOD_TYPES = [
  'PREPARATION',
  'AVAILABLE',
  'RENTAL',
  'DOWNTIME',
  'SALU',
  'OTHER',
] as const;

type PrimaryPeriodType = (typeof PRIMARY_PERIOD_TYPES)[number];

const ACTIVITY_TYPES = [
  'WORKSHOP',
  'SERVICE',
  'WAITING_PARTS',
  'TRANSPORT',
  'ADMINISTRATION',
  'MISSING_EQUIPMENT',
  'OTHER',
] as const;

type ActivityType = (typeof ACTIVITY_TYPES)[number];

const DOWNTIME_REASONS = [
  'DAMAGE',
  'WORKSHOP',
  'SERVICE',
  'WAITING_PARTS',
  'MISSING_EQUIPMENT',
  'TRANSPORT',
  'ADMINISTRATION',
  'OTHER',
] as const;

type DowntimeReason = (typeof DOWNTIME_REASONS)[number];

function cleanRegnr(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : '';
}

function cleanPrimaryPeriodType(value: unknown): PrimaryPeriodType | null {
  const periodType = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return PRIMARY_PERIOD_TYPES.includes(periodType as PrimaryPeriodType) ? periodType as PrimaryPeriodType : null;
}

function cleanActivityType(value: unknown): ActivityType | null {
  const activityType = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ACTIVITY_TYPES.includes(activityType as ActivityType) ? activityType as ActivityType : null;
}

function cleanReasonCode(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').slice(0, 80) || null;
}

function cleanReasonText(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, 500);
}

function parseTimestamp(value: unknown, fallbackToNow: boolean): string | null {
  if ((value === null || value === undefined || value === '') && fallbackToNow) {
    return new Date().toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value.trim()) ? value.trim() : null;
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

function rpcErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function rpcErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object' || !('message' in error)) return '';
  return typeof error.message === 'string' ? error.message : '';
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
    console.error('[vehicle-journey-periods] Missing server configuration:', error);
    return NextResponse.json({ error: 'Vehicle journey unavailable' }, { status: 503 });
  }

  try {
    if (!(await vehicleExists(admin, regnr))) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    if (action === 'START' || action === 'TRANSITION') {
      const periodType = cleanPrimaryPeriodType(body.periodType);
      if (!periodType) {
        return NextResponse.json({ error: 'Invalid primary period type' }, { status: 400 });
      }

      const startedAt = parseTimestamp(body.startedAt, true);
      if (!startedAt) {
        return NextResponse.json({ error: 'Invalid start time' }, { status: 400 });
      }

      const reasonCode = cleanReasonCode(body.reasonCode);
      const reasonText = cleanReasonText(body.reasonText);
      if (periodType === 'DOWNTIME') {
        if (!reasonCode || !DOWNTIME_REASONS.includes(reasonCode as DowntimeReason)) {
          return NextResponse.json({ error: 'Downtime requires a valid reason' }, { status: 400 });
        }
        if (reasonCode === 'OTHER' && !reasonText) {
          return NextResponse.json({ error: 'Other downtime requires a comment' }, { status: 400 });
        }
      }

      const periodId = crypto.randomUUID();
      const { data: period, error: periodError } = await admin.rpc('transition_vehicle_journey_state', {
        p_period_id: periodId,
        p_regnr: regnr,
        p_period_type: periodType,
        p_started_at: startedAt,
        p_reason_code: reasonCode,
        p_reason_text: reasonText,
        p_source_system: 'VAGNKORT',
        p_source_entity: 'vehicle_journey_periods',
        p_source_record_id: periodId,
        p_actor_id: verification.user.id,
        p_actor_source: 'MANUELL',
        p_actor_email: verification.user.email,
        p_metadata: { createdVia: 'VAGNKORT' },
      });

      if (periodError) {
        const message = rpcErrorMessage(periodError);
        if (message.includes('already in requested state')) {
          return NextResponse.json({ error: 'Vehicle is already in requested state' }, { status: 409 });
        }
        if (rpcErrorCode(periodError) === '22007') {
          return NextResponse.json({ error: 'Transition time is before current state start' }, { status: 400 });
        }
        console.error('[vehicle-journey-periods] Atomic transition failed:', periodError);
        return NextResponse.json({ error: 'Could not transition vehicle state' }, { status: 500 });
      }

      return NextResponse.json({ data: period }, { status: 201 });
    }

    if (action === 'CLOSE') {
      const periodId = cleanUuid(body.periodId);
      if (!periodId) {
        return NextResponse.json({ error: 'Invalid period id' }, { status: 400 });
      }

      const endedAt = parseTimestamp(body.endedAt, true);
      if (!endedAt) {
        return NextResponse.json({ error: 'Invalid end time' }, { status: 400 });
      }

      const { data: period, error: periodError } = await admin.rpc('close_vehicle_journey_period', {
        p_period_id: periodId,
        p_regnr: regnr,
        p_ended_at: endedAt,
        p_actor_id: verification.user.id,
        p_actor_email: verification.user.email,
      });

      if (periodError) {
        const code = rpcErrorCode(periodError);
        const message = rpcErrorMessage(periodError);
        if (code === 'P0002' || message.includes('Period not found for vehicle')) {
          return NextResponse.json({ error: 'Period not found for vehicle' }, { status: 404 });
        }
        if (message.includes('Period is already closed')) {
          return NextResponse.json({ error: 'Period is already closed' }, { status: 409 });
        }
        if (code === '22007' || message.includes('End time cannot be before start time')) {
          return NextResponse.json({ error: 'End time cannot be before start time' }, { status: 400 });
        }
        console.error('[vehicle-journey-periods] Atomic close failed:', periodError);
        return NextResponse.json({ error: 'Could not close period' }, { status: 500 });
      }

      return NextResponse.json({ data: period });
    }

    if (action === 'START_ACTIVITY') {
      const parentPeriodId = cleanUuid(body.parentPeriodId);
      const activityType = cleanActivityType(body.activityType);
      const startedAt = parseTimestamp(body.startedAt, true);
      const reasonText = cleanReasonText(body.reasonText);
      if (!parentPeriodId || !activityType || !startedAt) {
        return NextResponse.json({ error: 'Invalid activity period input' }, { status: 400 });
      }
      if (activityType === 'OTHER' && !reasonText) {
        return NextResponse.json({ error: 'Other activity requires a comment' }, { status: 400 });
      }

      const activityPeriodId = crypto.randomUUID();
      const { data, error } = await admin.rpc('start_vehicle_journey_activity_period', {
        p_activity_period_id: activityPeriodId,
        p_parent_period_id: parentPeriodId,
        p_regnr: regnr,
        p_activity_type: activityType,
        p_started_at: startedAt,
        p_reason_text: reasonText,
        p_source_system: 'VAGNKORT',
        p_source_entity: 'vehicle_journey_activity_periods',
        p_source_record_id: activityPeriodId,
        p_actor_id: verification.user.id,
        p_actor_source: 'MANUELL',
        p_actor_email: verification.user.email,
        p_metadata: { createdVia: 'VAGNKORT' },
      });

      if (error) {
        if (rpcErrorCode(error) === '23505') {
          return NextResponse.json({ error: `${activityType} is already open in this downtime` }, { status: 409 });
        }
        console.error('[vehicle-journey-periods] Activity start failed:', error);
        return NextResponse.json({ error: 'Could not start journey activity' }, { status: 500 });
      }
      return NextResponse.json({ data }, { status: 201 });
    }

    if (action === 'CLOSE_ACTIVITY') {
      const activityPeriodId = cleanUuid(body.activityPeriodId);
      const endedAt = parseTimestamp(body.endedAt, true);
      if (!activityPeriodId || !endedAt) {
        return NextResponse.json({ error: 'Invalid activity close input' }, { status: 400 });
      }

      const { data, error } = await admin.rpc('close_vehicle_journey_activity_period', {
        p_activity_period_id: activityPeriodId,
        p_regnr: regnr,
        p_ended_at: endedAt,
        p_source_system: 'VAGNKORT',
        p_source_entity: 'vehicle_journey_activity_periods',
        p_source_record_id: activityPeriodId,
        p_actor_id: verification.user.id,
        p_actor_source: 'MANUELL',
        p_actor_email: verification.user.email,
      });

      if (error) {
        const code = rpcErrorCode(error);
        const message = rpcErrorMessage(error);
        if (code === 'P0002') return NextResponse.json({ error: 'Journey activity not found' }, { status: 404 });
        if (message.includes('already closed')) return NextResponse.json({ error: 'Journey activity is already closed' }, { status: 409 });
        if (code === '22007') return NextResponse.json({ error: 'Invalid activity end time' }, { status: 400 });
        console.error('[vehicle-journey-periods] Activity close failed:', error);
        return NextResponse.json({ error: 'Could not close journey activity' }, { status: 500 });
      }
      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[vehicle-journey-periods] Unexpected error:', error);
    return NextResponse.json({ error: 'Period operation failed' }, { status: 500 });
  }
}
