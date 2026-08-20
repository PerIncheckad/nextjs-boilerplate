import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;

const EQUIPMENT_FIELDS = [
  'keys',
  'chargingCables',
  'privacyCovers',
  'instructionBook',
  'coc',
  'wheelLocks',
  'towbar',
  'rubberMats',
  'tireCompressor',
  'mountedWheels',
  'looseWheels',
] as const;

type EquipmentField = (typeof EQUIPMENT_FIELDS)[number];

type EquipmentValue = string | number | boolean | null;

function cleanRegnr(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : '';
}

function cleanField(value: unknown): EquipmentField | null {
  return typeof value === 'string' && EQUIPMENT_FIELDS.includes(value as EquipmentField)
    ? value as EquipmentField
    : null;
}

function cleanComment(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, 500);
}

function cleanValue(field: EquipmentField, value: unknown): EquipmentValue | undefined {
  if (value === null) return null;

  if (field === 'keys' || field === 'chargingCables' || field === 'privacyCovers') {
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > 20) return undefined;
    return numberValue;
  }

  if (
    field === 'instructionBook' ||
    field === 'coc' ||
    field === 'wheelLocks' ||
    field === 'towbar' ||
    field === 'rubberMats' ||
    field === 'tireCompressor'
  ) {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, 120);
  return normalized || null;
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

  const regnr = cleanRegnr(body.regnr);
  if (!REGNR_RE.test(regnr)) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }

  const field = cleanField(body.field);
  if (!field) {
    return NextResponse.json({ error: 'Invalid equipment field' }, { status: 400 });
  }

  const value = cleanValue(field, body.value);
  if (value === undefined) {
    return NextResponse.json({ error: 'Invalid equipment value' }, { status: 400 });
  }

  const comment = cleanComment(body.comment);
  if (!comment) {
    return NextResponse.json({ error: 'Equipment change requires a comment' }, { status: 400 });
  }

  const occurredAtInput = typeof body.occurredAt === 'string' && body.occurredAt.trim()
    ? new Date(body.occurredAt)
    : new Date();
  if (Number.isNaN(occurredAtInput.getTime())) {
    return NextResponse.json({ error: 'Invalid occurrence time' }, { status: 400 });
  }
  const occurredAt = occurredAtInput.toISOString();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[vehicle-equipment] Missing server configuration:', error);
    return NextResponse.json({ error: 'Vehicle journey unavailable' }, { status: 503 });
  }

  try {
    if (!(await vehicleExists(admin, regnr))) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    const eventId = crypto.randomUUID();
    const { data: event, error } = await admin
      .from('vehicle_journey_events')
      .insert({
        event_id: eventId,
        regnr,
        event_type: 'EQUIPMENT_CHANGED',
        event_key: `equipment-change:${eventId}`,
        occurred_at: occurredAt,
        source_system: 'VAGNKORT',
        source_entity: 'vehicle_equipment',
        source_record_id: eventId,
        actor_id: verification.user.id,
        actor_source: 'MANUELL',
        actor_email: verification.user.email,
        payload: {
          field,
          value,
          comment,
        },
      })
      .select('event_id,event_type,occurred_at,actor_id,actor_email,payload')
      .single();

    if (error || !event) {
      console.error('[vehicle-equipment] Could not append equipment event:', error);
      return NextResponse.json({ error: 'Could not register equipment change' }, { status: 500 });
    }

    return NextResponse.json({ data: event }, { status: 201 });
  } catch (error) {
    console.error('[vehicle-equipment] Unexpected error:', error);
    return NextResponse.json({ error: 'Equipment change failed' }, { status: 500 });
  }
}
