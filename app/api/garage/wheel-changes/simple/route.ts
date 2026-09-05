import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import { classifyWheelEligibility, operationalWheelSeason } from '@/lib/wheel-change-season';

type SimpleAction = 'BOOK' | 'COMPLETE';

type CandidateSource = {
  regnr: string;
  current_wheel_type: string | null;
  latest_checkin_at: string | null;
  current_city: string | null;
  current_station: string | null;
  current_saludatum: string | null;
};

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase server configuration');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

function cleanTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function cleanAction(value: unknown): SimpleAction | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized === 'BOOK' || normalized === 'COMPLETE' ? normalized : null;
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === '22023') return NextResponse.json({ error: error.message || 'Ogiltiga uppgifter' }, { status: 400 });
  if (error.code === 'P0002') return NextResponse.json({ error: error.message || 'Hjulskifte saknas' }, { status: 404 });
  if (error.code === 'P0001' || error.code === '23505') return NextResponse.json({ error: error.message || 'Hjulskiftet kan inte ändras' }, { status: 409 });
  return null;
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

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = cleanAction(body.action);
  const regnr = cleanRegnr(body.regnr);
  const rawBookedFor = body.booked_for ?? body.bookedFor;
  const bookedFor = cleanTimestamp(rawBookedFor);
  const supplier = cleanText(body.supplier, 200);
  const location = cleanText(body.location, 200);
  const note = cleanText(body.note, 1000);

  if (!action || !regnr) return NextResponse.json({ error: 'Ogiltig åtgärd eller registreringsnummer' }, { status: 400 });
  if (action === 'BOOK' && !bookedFor) return NextResponse.json({ error: 'Bokad tid krävs' }, { status: 400 });
  if (rawBookedFor !== null && rawBookedFor !== undefined && rawBookedFor !== '' && !bookedFor) {
    return NextResponse.json({ error: 'Ogiltigt bokningsdatum' }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[garage-wheel-changes-simple] Missing server configuration:', error);
    return NextResponse.json({ error: 'Hjulskifte är inte tillgängligt' }, { status: 503 });
  }

  try {
    const operational = operationalWheelSeason(new Date());
    if (!operational.active) {
      return NextResponse.json({ error: 'Hjulskiftesäsongen har inte startat ännu' }, { status: 409 });
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
    if (!candidate) return NextResponse.json({ error: 'Bilen saknar verifierat underlag för hjulbedömning' }, { status: 409 });

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

    const rpcName = action === 'BOOK'
      ? 'book_garage_wheel_change_for_vehicle'
      : 'complete_garage_wheel_change_for_vehicle';

    const rpcArgs = action === 'BOOK'
      ? {
          p_regnr: regnr,
          p_season_key: operational.season.key,
          p_target_wheel_type: operational.season.targetWheelType,
          p_booked_for: bookedFor,
          p_supplier: supplier,
          p_location: location,
          p_note: note,
          p_actor_id: verification.user.id,
          p_actor_email: verification.user.email,
        }
      : {
          p_regnr: regnr,
          p_season_key: operational.season.key,
          p_target_wheel_type: operational.season.targetWheelType,
          p_supplier: supplier,
          p_location: location,
          p_note: note,
          p_actor_id: verification.user.id,
          p_actor_email: verification.user.email,
        };

    const { data, error } = await admin.rpc(rpcName, rpcArgs);
    if (error) {
      const response = rpcErrorResponse(error);
      if (response) return response;
      throw error;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[garage-wheel-changes-simple] Action failed:', error);
    return NextResponse.json({ error: 'Kunde inte uppdatera hjulskiftet' }, { status: 500 });
  }
}
