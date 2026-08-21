import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERIOD_TYPES = ['PREPARATION', 'AVAILABLE', 'RENTAL', 'DOWNTIME', 'WORKSHOP', 'TRANSPORT', 'SALU', 'OTHER'] as const;
type PeriodType = (typeof PERIOD_TYPES)[number];

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanRegnr(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : '';
}

function cleanPeriodType(value: unknown): PeriodType | null {
  const type = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return PERIOD_TYPES.includes(type as PeriodType) ? type as PeriodType : null;
}

function cleanText(value: unknown, maxLength = 500): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, maxLength) : null;
}

function cleanTimestamp(value: unknown, fallbackNow = false): string | null {
  if ((value === null || value === undefined || value === '') && fallbackNow) return new Date().toISOString();
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function vehicleExists(admin: ReturnType<typeof createAdminClient>, regnr: string) {
  const [vehicle, nybil, checkin, salu, journey] = await Promise.all([
    admin.from('vehicles').select('regnr').eq('regnr', regnr).limit(1),
    admin.from('nybil_inventering').select('regnr').eq('regnr', regnr).limit(1),
    admin.from('checkins').select('regnr').eq('regnr', regnr).limit(1),
    admin.from('salu_vehicle_state').select('regnr').eq('regnr', regnr).limit(1),
    admin.from('vehicle_journey_events').select('regnr').eq('regnr', regnr).limit(1),
  ]);
  const responses = [vehicle, nybil, checkin, salu, journey];
  const failed = responses.find((response) => response.error);
  if (failed?.error) throw failed.error;
  return responses.some((response) => (response.data?.length ?? 0) > 0);
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

  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
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

    if (action === 'start') {
      const periodType = cleanPeriodType(body.periodType);
      if (!periodType) return NextResponse.json({ error: 'Invalid period type' }, { status: 400 });

      const startedAt = cleanTimestamp(body.startedAt, true);
      if (!startedAt) return NextResponse.json({ error: 'Invalid start time' }, { status: 400 });

      const reasonCode = cleanText(body.reasonCode, 80)?.toUpperCase().replace(/[^A-Z0-9_-]+/g, '_') ?? null;
      const reasonText = cleanText(body.reasonText);
      const periodId = crypto.randomUUID();

      const { data: period, error: insertError } = await admin
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
        .select('period_id,period_type,started_at,ended_at,reason_code,reason_text')
        .single();

      if (insertError || !period) {
        if (insertError?.code === '23505') {
          return NextResponse.json({ error: 'An open period of this type already exists' }, { status: 409 });
        }
        console.error('[vehicle-journey-periods] Could not start period:', insertError);
        return NextResponse.json({ error: 'Could not start period' }, { status: 500 });
      }

      const { data: event, error: eventError } = await admin
        .from('vehicle_journey_events')
        .insert({
          regnr,
          event_type: 'PERIOD_STARTED',
          event_key: `vehicle-period:${periodId}:started`,
          occurred_at: startedAt,
          source_system: 'VAGNKORT',
          source_entity: 'vehicle_journey_periods',
          source_record_id: periodId,
          actor_id: verification.user.id,
          actor_source: 'MANUELL',
          actor_email: verification.user.email,
          payload: { periodType, reasonCode, reasonText },
        })
        .select('event_id')
        .single();

      if (eventError || !event) {
        console.error('[vehicle-journey-periods] Could not append start event:', eventError);
        await admin.from('vehicle_journey_periods').delete().eq('period_id', periodId);
        return NextResponse.json({ error: 'Could not start period' }, { status: 500 });
      }

      const { error: linkError } = await admin
        .from('vehicle_journey_periods')
        .update({ source_event_id: event.event_id })
        .eq('period_id', periodId);
      if (linkError) console.error('[vehicle-journey-periods] Could not link start event:', linkError);

      return NextResponse.json({ data: { ...period, source_event_id: event.event_id } }, { status: 201 });
    }

    if (action === 'end') {
      const periodId = typeof body.periodId === 'string' ? body.periodId.trim() : '';
      if (!UUID_RE.test(periodId)) return NextResponse.json({ error: 'Invalid period id' }, { status: 400 });

      const endedAt = cleanTimestamp(body.endedAt, true);
      if (!endedAt) return NextResponse.json({ error: 'Invalid end time' }, { status: 400 });

      const { data: existing, error: fetchError } = await admin
        .from('vehicle_journey_periods')
        .select('period_id,period_type,started_at,ended_at,reason_code,reason_text')
        .eq('period_id', periodId)
        .eq('regnr', regnr)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!existing) return NextResponse.json({ error: 'Period not found for vehicle' }, { status: 404 });
      if (existing.ended_at) return NextResponse.json({ error: 'Period is already ended' }, { status: 409 });
      if (new Date(endedAt).getTime() < new Date(existing.started_at).getTime()) {
        return NextResponse.json({ error: 'End time cannot be before start time' }, { status: 400 });
      }

      const { data: period, error: updateError } = await admin
        .from('vehicle_journey_periods')
        .update({ ended_at: endedAt })
        .eq('period_id', periodId)
        .is('ended_at', null)
        .select('period_id,period_type,started_at,ended_at,reason_code,reason_text')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!period) return NextResponse.json({ error: 'Period was changed by another user' }, { status: 409 });

      const { error: eventError } = await admin
        .from('vehicle_journey_events')
        .insert({
          regnr,
          event_type: 'PERIOD_ENDED',
          event_key: `vehicle-period:${periodId}:ended`,
          occurred_at: endedAt,
          source_system: 'VAGNKORT',
          source_entity: 'vehicle_journey_periods',
          source_record_id: periodId,
          actor_id: verification.user.id,
          actor_source: 'MANUELL',
          actor_email: verification.user.email,
          payload: { periodType: existing.period_type, reasonCode: existing.reason_code, reasonText: existing.reason_text },
        });

      if (eventError) {
        console.error('[vehicle-journey-periods] Could not append end event:', eventError);
        await admin.from('vehicle_journey_periods').update({ ended_at: null }).eq('period_id', periodId).eq('ended_at', endedAt);
        return NextResponse.json({ error: 'Could not end period' }, { status: 500 });
      }

      return NextResponse.json({ data: period });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[vehicle-journey-periods] Unexpected error:', error);
    return NextResponse.json({ error: 'Vehicle journey update failed' }, { status: 500 });
  }
}
