import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import {
  classifyWheelEligibility,
  operationalWheelSeason,
  type WheelEligibility,
  type WheelSeason,
} from '@/lib/wheel-change-season';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = ['KRAVS', 'BOKAD', 'PAGAENDE', 'KLAR', 'AVVIKELSE'] as const;

type WheelStatus = (typeof STATUSES)[number];
type CandidateSource = {
  regnr: string;
  current_wheel_type: string | null;
  latest_checkin_at: string | null;
  current_city: string | null;
  current_station: string | null;
  current_saludatum: string | null;
};

type WheelCandidate = CandidateSource & {
  eligibility: WheelEligibility;
};

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value.trim()) ? value.trim() : null;
}

function cleanRegnr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/\s+/g, '').trim();
  return normalized || null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, maxLength);
}

function cleanStatus(value: unknown): WheelStatus | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return STATUSES.includes(normalized as WheelStatus) ? normalized as WheelStatus : null;
}

function cleanTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === '22023') return NextResponse.json({ error: error.message || 'Ogiltiga uppgifter' }, { status: 400 });
  if (error.code === 'P0002') return NextResponse.json({ error: error.message || 'Hjulskifte saknas' }, { status: 404 });
  if (error.code === 'P0001' || error.code === '23505') return NextResponse.json({ error: error.message || 'Hjulskiftet kan inte ändras' }, { status: 409 });
  return null;
}

function buildCandidates(source: CandidateSource[], season: WheelSeason): WheelCandidate[] {
  return source.map((item) => ({
    ...item,
    eligibility: classifyWheelEligibility(season, item.current_wheel_type, item.current_saludatum),
  }));
}

async function readCandidateSource(admin: ReturnType<typeof createAdminClient>): Promise<CandidateSource[]> {
  const { data, error } = await admin.rpc('get_wheel_change_candidate_source');
  if (error) throw error;
  return (data ?? []) as CandidateSource[];
}

async function readSoldRegnrs(admin: ReturnType<typeof createAdminClient>): Promise<Set<string>> {
  const [soldInventoryResponse, soldEditsResponse] = await Promise.all([
    admin.from('nybil_inventering').select('regnr').eq('is_sold', true),
    admin
      .from('vehicle_edits')
      .select('regnr,new_value,edited_at')
      .eq('field_name', 'is_sold')
      .order('edited_at', { ascending: false }),
  ]);

  if (soldInventoryResponse.error) throw soldInventoryResponse.error;
  if (soldEditsResponse.error) throw soldEditsResponse.error;

  const latestSoldEdits = new Map<string, string>();
  for (const edit of soldEditsResponse.data ?? []) {
    const regnr = cleanRegnr(edit.regnr);
    if (regnr && !latestSoldEdits.has(regnr)) latestSoldEdits.set(regnr, edit.new_value ?? '');
  }

  const soldRegnrs = new Set<string>();
  for (const row of soldInventoryResponse.data ?? []) {
    const regnr = cleanRegnr(row.regnr);
    if (regnr) soldRegnrs.add(regnr);
  }
  for (const [regnr, value] of latestSoldEdits.entries()) {
    if (value === 'true') soldRegnrs.add(regnr);
  }

  return soldRegnrs;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[garage-wheel-changes] Missing server configuration:', error);
    return NextResponse.json({ error: 'Hjulskifte är inte tillgängligt' }, { status: 503 });
  }

  try {
    const now = new Date();
    const operational = operationalWheelSeason(now);
    const [itemsRes, wheelRes, candidateSource, soldRegnrs] = await Promise.all([
      admin.from('garage_items')
        .select('garage_item_id,regnr,model,planned_station,garage_direction,source_kind,updated_at')
        .not('regnr', 'is', null)
        .is('voided_at', null)
        .order('updated_at', { ascending: false }),
      admin.from('garage_wheel_changes')
        .select('wheel_change_id,garage_item_id,regnr,checkpoint_id,status,season_key,target_wheel_type,booked_for,supplier,location,note,completed_at,created_at,updated_at')
        .order('updated_at', { ascending: false }),
      readCandidateSource(admin),
      readSoldRegnrs(admin),
    ]);

    if (itemsRes.error) throw itemsRes.error;
    if (wheelRes.error) throw wheelRes.error;

    const wheelChanges = (wheelRes.data ?? []).map((item) => ({
      ...item,
      overdue: Boolean(
        item.booked_for
        && Date.parse(item.booked_for) < now.getTime()
        && item.status !== 'PAGAENDE'
        && item.status !== 'KLAR'
      ),
    }));

    const handledThisSeason = new Set(
      wheelChanges
        .filter((item) => item.season_key === operational.season.key)
        .map((item) => cleanRegnr(item.regnr))
        .filter((regnr): regnr is string => Boolean(regnr)),
    );

    const candidates = buildCandidates(candidateSource, operational.season)
      .filter((item) => {
        const regnr = cleanRegnr(item.regnr) ?? '';
        return !soldRegnrs.has(regnr) && !handledThisSeason.has(regnr);
      });

    const counts = candidates.reduce<Record<WheelEligibility, number>>((acc, item) => {
      acc[item.eligibility] += 1;
      return acc;
    }, {
      REQUIRES_CHANGE: 0,
      ALREADY_CORRECT: 0,
      SALU_EXEMPT: 0,
      UNKNOWN_WHEEL_STATUS: 0,
    });

    return NextResponse.json({
      data: {
        garageItems: itemsRes.data ?? [],
        wheelChanges,
        season: {
          ...operational.season,
          active: operational.active,
          mode: operational.active ? 'ACTIVE' : 'PREVIEW',
        },
        candidates,
        counts,
        semantics: 'STATUS_THEN_COMPLETED_CHECKIN_THEN_NYBIL_EXCLUDING_SOLD',
      },
    });
  } catch (error) {
    console.error('[garage-wheel-changes] Read failed:', error);
    return NextResponse.json({ error: 'Kunde inte läsa hjulskiften' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const garageItemId = cleanUuid(body.garage_item_id ?? body.garageItemId);
  const regnr = cleanRegnr(body.regnr);
  const note = cleanText(body.note, 1000);
  const requestedStatus = cleanStatus(body.status);
  const rawBookedFor = body.booked_for ?? body.bookedFor;
  const bookedFor = cleanTimestamp(rawBookedFor);
  const supplier = cleanText(body.supplier, 200);
  const location = cleanText(body.location, 200);

  if (body.status !== null && body.status !== undefined && !requestedStatus) {
    return NextResponse.json({ error: 'Ogiltig status' }, { status: 400 });
  }
  if (rawBookedFor !== null && rawBookedFor !== undefined && rawBookedFor !== '' && !bookedFor) {
    return NextResponse.json({ error: 'Ogiltigt bokningsdatum' }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[garage-wheel-changes] Missing server configuration:', error);
    return NextResponse.json({ error: 'Hjulskifte är inte tillgängligt' }, { status: 503 });
  }

  try {
    if (regnr) {
      const operational = operationalWheelSeason(new Date());
      if (!operational.active) {
        return NextResponse.json({ error: 'Hjulskiftesäsongen har inte startat ännu' }, { status: 409 });
      }
      if (requestedStatus && requestedStatus !== 'BOKAD' && requestedStatus !== 'KLAR') {
        return NextResponse.json({ error: 'Snabbflödet stöder endast BOKAD eller KLAR' }, { status: 400 });
      }
      if (requestedStatus === 'BOKAD' && !bookedFor) {
        return NextResponse.json({ error: 'Bokad tid krävs när hjulskiftet är BOKAD' }, { status: 400 });
      }

      const [existingSeasonalResponse, soldRegnrs, source] = await Promise.all([
        admin
          .from('garage_wheel_changes')
          .select('wheel_change_id')
          .eq('regnr', regnr)
          .eq('season_key', operational.season.key)
          .limit(1),
        readSoldRegnrs(admin),
        readCandidateSource(admin),
      ]);
      if (existingSeasonalResponse.error) throw existingSeasonalResponse.error;
      if ((existingSeasonalResponse.data ?? []).length > 0) {
        return NextResponse.json({ error: 'Hjulskifte finns redan för bilen och säsongen' }, { status: 409 });
      }
      if (soldRegnrs.has(regnr)) {
        return NextResponse.json({ error: 'Bilen är markerad som såld och kan inte starta säsongsbundet hjulskifte' }, { status: 409 });
      }

      const candidate = source.find((item) => cleanRegnr(item.regnr) === regnr);
      if (!candidate) return NextResponse.json({ error: 'Bilen saknar verifierad hjulstatus för hjulbedömning' }, { status: 409 });

      const eligibility = classifyWheelEligibility(
        operational.season,
        candidate.current_wheel_type,
        candidate.current_saludatum,
      );
      if (eligibility !== 'REQUIRES_CHANGE') {
        const message = eligibility === 'ALREADY_CORRECT'
          ? 'Bilen har redan rätt hjul för säsongen'
          : eligibility === 'SALU_EXEMPT'
            ? 'Bilen omfattas av SALU-undantaget'
            : 'Bilen saknar verifierad hjulstatus';
        return NextResponse.json({ error: message }, { status: 409 });
      }

      if (requestedStatus) {
        const { data, error } = await admin.rpc('open_garage_wheel_change_for_vehicle', {
          p_regnr: regnr,
          p_season_key: operational.season.key,
          p_target_wheel_type: operational.season.targetWheelType,
          p_status: requestedStatus,
          p_booked_for: bookedFor,
          p_supplier: supplier,
          p_location: location,
          p_note: note,
          p_actor_id: verification.user.id,
          p_actor_email: verification.user.email,
        });
        if (error) {
          const response = rpcErrorResponse(error);
          if (response) return response;
          throw error;
        }
        return NextResponse.json({ data }, { status: 201 });
      }

      const { data, error } = await admin.rpc('create_garage_wheel_change_for_vehicle', {
        p_regnr: regnr,
        p_season_key: operational.season.key,
        p_target_wheel_type: operational.season.targetWheelType,
        p_note: note,
        p_actor_id: verification.user.id,
        p_actor_email: verification.user.email,
      });
      if (error) {
        const response = rpcErrorResponse(error);
        if (response) return response;
        throw error;
      }
      return NextResponse.json({ data }, { status: 201 });
    }

    if (!garageItemId) return NextResponse.json({ error: 'Ogiltigt Garage-objekt eller registreringsnummer' }, { status: 400 });

    const { data, error } = await admin.rpc('create_garage_wheel_change', {
      p_garage_item_id: garageItemId,
      p_note: note,
      p_actor_id: verification.user.id,
      p_actor_email: verification.user.email,
    });
    if (error) {
      const response = rpcErrorResponse(error);
      if (response) return response;
      throw error;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[garage-wheel-changes] Create failed:', error);
    return NextResponse.json({ error: 'Kunde inte starta hjulskifte' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const wheelChangeId = cleanUuid(body.wheel_change_id ?? body.wheelChangeId);
  const status = cleanStatus(body.status);
  const rawBookedFor = body.booked_for ?? body.bookedFor;
  const bookedFor = cleanTimestamp(rawBookedFor);
  const supplier = cleanText(body.supplier, 200);
  const location = cleanText(body.location, 200);
  const note = cleanText(body.note, 1000);

  if (!wheelChangeId) return NextResponse.json({ error: 'Ogiltigt hjulskifte' }, { status: 400 });
  if (!status) return NextResponse.json({ error: 'Ogiltig status' }, { status: 400 });
  if (rawBookedFor !== null && rawBookedFor !== undefined && rawBookedFor !== '' && !bookedFor) {
    return NextResponse.json({ error: 'Ogiltigt bokningsdatum' }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[garage-wheel-changes] Missing server configuration:', error);
    return NextResponse.json({ error: 'Hjulskifte är inte tillgängligt' }, { status: 503 });
  }

  try {
    const { data, error } = await admin.rpc('update_garage_wheel_change', {
      p_wheel_change_id: wheelChangeId,
      p_status: status,
      p_booked_for: bookedFor,
      p_supplier: supplier,
      p_location: location,
      p_note: note,
      p_actor_id: verification.user.id,
      p_actor_email: verification.user.email,
    });
    if (error) {
      const response = rpcErrorResponse(error);
      if (response) return response;
      throw error;
    }
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[garage-wheel-changes] Update failed:', error);
    return NextResponse.json({ error: 'Kunde inte uppdatera hjulskifte' }, { status: 500 });
  }
}
