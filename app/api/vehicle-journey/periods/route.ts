import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PERIOD_TYPES = [
  'PREPARATION',
  'AVAILABLE',
  'RENTAL',
  'DOWNTIME',
  'WORKSHOP',
  'TRANSPORT',
  'SALU',
  'OTHER',
] as const;

type PeriodType = (typeof PERIOD_TYPES)[number];

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

function cleanPeriodType(value: unknown): PeriodType | null {
  const periodType = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return PERIOD_TYPES.includes(periodType as PeriodType) ? periodType as PeriodType : null;
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

async function appendPeriodEvent(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    eventType: 'PERIOD_STARTED' | 'PERIOD_ENDED';
    regnr: string;
    periodId: string;
    occurredAt: string;
    actorId: string;
    actorEmail: string;
    payload: Record<string, unknown>;
  },
) {
  const { data: event, error } = await admin
    .from('vehicle_journey_events')
    .insert({
      regnr: input.regnr,
      event_type: input.eventType,
      event_key: `vehicle-period:${input.periodId}:${input.eventType}`,
      occurred_at: input.occurredAt,
      source_system: 'VAGNKORT',
      source_entity: 'vehicle_journey_periods',
      source_record_id: input.periodId,
      actor_id: input.actorId,
      actor_source: 'MANUELL',
      actor_email: input.actorEmail,
      payload: input.payload,
    })
    .select('event_id')
    .single();

  if (error || !event) {
    console.error(`[vehicle-journey-periods] Could not append ${input.eventType}:`, error);
    return null;
  }
  return event.event_id as string;
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

    if (action === 'START') {
      const periodType = cleanPeriodType(body.periodType);
      if (!periodType) {
        return NextResponse.json({ error: 'Invalid period type' }, { status: 400 });
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

      const { data: existingOpen, error: existingError } = await admin
        .from('vehicle_journey_periods')
        .select('period_id')
        .eq('regnr', regnr)
        .eq('period_type', periodType)
        .is('ended_at', null)
        .limit(1);
      if (existingError) throw existingError;
      if ((existingOpen?.length ?? 0) > 0) {
        return NextResponse.json({ error: `${periodType} is already open for vehicle` }, { status: 409 });
      }

      const periodId = crypto.randomUUID();
      const { data: period, error: periodError } = await admin
        .from('vehicle_journey_periods')
        .insert({
          period_id: periodId,
          regnr,
          period_type: periodType,
          started_at: startedAt,
          reason_code: reasonCode,
          reason_text: reasonText,
          source_system: 'VAGNKORT',
          source_entity: 'vehicle_journey_periods',
          source_record_id: periodId,
          metadata: { createdVia: 'VAGNKORT' },
          created_by: verification.user.id,
        })
        .select('period_id,period_type,started_at,ended_at,reason_code,reason_text,source_system,source_event_id,metadata,created_at,updated_at')
        .single();

      if (periodError || !period) {
        console.error('[vehicle-journey-periods] Could not create period:', periodError);
        return NextResponse.json({ error: 'Could not start period' }, { status: 500 });
      }

      const sourceEventId = await appendPeriodEvent(admin, {
        eventType: 'PERIOD_STARTED',
        regnr,
        periodId,
        occurredAt: startedAt,
        actorId: verification.user.id,
        actorEmail: verification.user.email,
        payload: {
          periodType,
          startedAt,
          reasonCode,
          reasonText,
        },
      });

      if (sourceEventId) {
        const { error: linkError } = await admin
          .from('vehicle_journey_periods')
          .update({ source_event_id: sourceEventId, updated_at: new Date().toISOString() })
          .eq('period_id', periodId);
        if (linkError) console.error('[vehicle-journey-periods] Could not link start event:', linkError);
      }

      return NextResponse.json({ data: { ...period, source_event_id: sourceEventId } }, { status: 201 });
    }

    if (action === 'CLOSE') {
      const periodId = typeof body.periodId === 'string' && UUID_RE.test(body.periodId.trim())
        ? body.periodId.trim()
        : null;
      if (!periodId) {
        return NextResponse.json({ error: 'Invalid period id' }, { status: 400 });
      }

      const endedAt = parseTimestamp(body.endedAt, true);
      if (!endedAt) {
        return NextResponse.json({ error: 'Invalid end time' }, { status: 400 });
      }

      const { data: current, error: currentError } = await admin
        .from('vehicle_journey_periods')
        .select('period_id,period_type,started_at,ended_at,reason_code,reason_text,source_event_id')
        .eq('period_id', periodId)
        .eq('regnr', regnr)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) {
        return NextResponse.json({ error: 'Period not found for vehicle' }, { status: 404 });
      }
      if (current.ended_at) {
        return NextResponse.json({ error: 'Period is already closed' }, { status: 409 });
      }
      if (new Date(endedAt).getTime() < new Date(current.started_at).getTime()) {
        return NextResponse.json({ error: 'End time cannot be before start time' }, { status: 400 });
      }

      const updatedAt = new Date().toISOString();
      const { data: period, error: updateError } = await admin
        .from('vehicle_journey_periods')
        .update({ ended_at: endedAt, updated_at: updatedAt })
        .eq('period_id', periodId)
        .eq('regnr', regnr)
        .is('ended_at', null)
        .select('period_id,period_type,started_at,ended_at,reason_code,reason_text,source_system,source_event_id,metadata,created_at,updated_at')
        .maybeSingle();

      if (updateError) throw updateError;
      if (!period) {
        return NextResponse.json({ error: 'Period changed before it could be closed' }, { status: 409 });
      }

      const durationHours = Math.round(
        ((new Date(endedAt).getTime() - new Date(current.started_at).getTime()) / 3_600_000) * 10,
      ) / 10;

      await appendPeriodEvent(admin, {
        eventType: 'PERIOD_ENDED',
        regnr,
        periodId,
        occurredAt: endedAt,
        actorId: verification.user.id,
        actorEmail: verification.user.email,
        payload: {
          periodType: current.period_type,
          startedAt: current.started_at,
          endedAt,
          durationHours,
          reasonCode: current.reason_code,
          reasonText: current.reason_text,
        },
      });

      return NextResponse.json({ data: { ...period, durationHours } });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[vehicle-journey-periods] Unexpected error:', error);
    return NextResponse.json({ error: 'Period operation failed' }, { status: 500 });
  }
}
