import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

type GarageFlag = 'UTVECKLA' | 'AVVECKLA' | 'HJULSKIFTE' | 'STILLESTAND';

type OverviewVehicle = {
  regnr: string;
  model: string | null;
  station: string | null;
  flags: Set<GarageFlag>;
  downtime_reason: string | null;
  wheel_status: string | null;
  updated_at: string | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizeRegnr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/\s+/g, '').trim();
  return normalized || null;
}

function ensureVehicle(map: Map<string, OverviewVehicle>, regnr: string) {
  const existing = map.get(regnr);
  if (existing) return existing;
  const created: OverviewVehicle = {
    regnr,
    model: null,
    station: null,
    flags: new Set<GarageFlag>(),
    downtime_reason: null,
    wheel_status: null,
    updated_at: null,
  };
  map.set(regnr, created);
  return created;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (error) {
    console.error('[garage-overview] Missing server configuration:', error);
    return NextResponse.json({ error: 'Garageöversikten är inte tillgänglig' }, { status: 503 });
  }

  try {
    const [garageRes, wheelRes, downtimeRes] = await Promise.all([
      admin.from('garage_items')
        .select('regnr,model,planned_station,garage_direction,updated_at')
        .is('voided_at', null)
        .not('regnr', 'is', null)
        .order('updated_at', { ascending: false }),
      admin.from('garage_wheel_changes')
        .select('regnr,status,updated_at')
        .neq('status', 'KLAR')
        .order('updated_at', { ascending: false }),
      admin.from('vehicle_journey_periods')
        .select('regnr,reason_code,reason_text,started_at,updated_at')
        .eq('period_type', 'DOWNTIME')
        .is('ended_at', null)
        .order('started_at', { ascending: false }),
    ]);

    if (garageRes.error) throw garageRes.error;
    if (wheelRes.error) throw wheelRes.error;
    if (downtimeRes.error) throw downtimeRes.error;

    const vehicles = new Map<string, OverviewVehicle>();

    for (const item of garageRes.data ?? []) {
      const regnr = normalizeRegnr(item.regnr);
      if (!regnr) continue;
      const vehicle = ensureVehicle(vehicles, regnr);
      if (!vehicle.model && item.model) vehicle.model = String(item.model);
      if (!vehicle.station && item.planned_station) vehicle.station = String(item.planned_station);
      if (!vehicle.updated_at && item.updated_at) vehicle.updated_at = String(item.updated_at);
      if (item.garage_direction === 'IN') vehicle.flags.add('UTVECKLA');
      if (item.garage_direction === 'UT') vehicle.flags.add('AVVECKLA');
    }

    for (const item of wheelRes.data ?? []) {
      const regnr = normalizeRegnr(item.regnr);
      if (!regnr) continue;
      const vehicle = ensureVehicle(vehicles, regnr);
      vehicle.flags.add('HJULSKIFTE');
      if (!vehicle.wheel_status && item.status) vehicle.wheel_status = String(item.status);
      if (!vehicle.updated_at && item.updated_at) vehicle.updated_at = String(item.updated_at);
    }

    for (const period of downtimeRes.data ?? []) {
      const regnr = normalizeRegnr(period.regnr);
      if (!regnr) continue;
      const vehicle = ensureVehicle(vehicles, regnr);
      vehicle.flags.add('STILLESTAND');
      if (!vehicle.downtime_reason) {
        vehicle.downtime_reason = period.reason_text
          ? String(period.reason_text)
          : period.reason_code
            ? String(period.reason_code)
            : null;
      }
      const periodUpdatedAt = period.updated_at ?? period.started_at;
      if (!vehicle.updated_at && periodUpdatedAt) vehicle.updated_at = String(periodUpdatedAt);
    }

    const data = Array.from(vehicles.values())
      .filter((vehicle) => vehicle.flags.size > 0)
      .map((vehicle) => ({
        regnr: vehicle.regnr,
        model: vehicle.model,
        station: vehicle.station,
        flags: Array.from(vehicle.flags),
        active_need_count: vehicle.flags.size,
        downtime_reason: vehicle.downtime_reason,
        wheel_status: vehicle.wheel_status,
        updated_at: vehicle.updated_at,
      }))
      .sort((a, b) => b.active_need_count - a.active_need_count || a.regnr.localeCompare(b.regnr, 'sv'));

    const counts = {
      ALLA: data.length,
      UTVECKLA: data.filter((vehicle) => vehicle.flags.includes('UTVECKLA')).length,
      AVVECKLA: data.filter((vehicle) => vehicle.flags.includes('AVVECKLA')).length,
      HJULSKIFTE: data.filter((vehicle) => vehicle.flags.includes('HJULSKIFTE')).length,
      STILLESTAND: data.filter((vehicle) => vehicle.flags.includes('STILLESTAND')).length,
      FLERA: data.filter((vehicle) => vehicle.active_need_count > 1).length,
    };

    return NextResponse.json({ data, counts });
  } catch (error) {
    console.error('[garage-overview] Read failed:', error);
    return NextResponse.json({ error: 'Kunde inte läsa Garageöversikten' }, { status: 500 });
  }
}
