import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const DIRECTIONS = new Set(['IN', 'UT']);
const REASONS = new Set(['BEHOV', 'UTOK', 'MINSKNING', 'SALU', 'SALU_RETUR', 'ANNAT']);
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

async function periodStatus(admin: ReturnType<typeof adminClient>, period: string) {
  const { data, error } = await admin.from('planning_period_status')
    .select('status,ready_at')
    .eq('period_code', period)
    .maybeSingle();
  if (error) throw error;
  return { status: data?.status ?? 'PAGAENDE', ready_at: data?.ready_at ?? null };
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const period = new URL(request.url).searchParams.get('period')?.trim() || '';
  if (!MONTH_RE.test(period)) return NextResponse.json({ error: 'Period måste vara YYYY-MM' }, { status: 400 });

  const admin = adminClient();
  let gate: { status: string; ready_at: string | null };
  try { gate = await periodStatus(admin, period); }
  catch (error) {
    console.error('[garage planning sources] period status lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsstatus' }, { status: 500 });
  }

  const { data: cells, error } = await admin
    .from('fleet_planning_cells')
    .select('planning_cell_id,period_code,model,station,ordered_count,note')
    .eq('period_code', period)
    .gt('ordered_count', 0)
    .order('model', { ascending: true })
    .order('station', { ascending: true });

  if (error) {
    console.error('[garage planning sources] planning lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa Planering' }, { status: 500 });
  }

  const ids = (cells ?? []).map((row) => row.planning_cell_id);
  let materialized: Array<{ source_planning_cell_id: string; source_planning_unit_no: number }> = [];
  if (ids.length > 0) {
    const { data, error: materializedError } = await admin
      .from('garage_items')
      .select('source_planning_cell_id,source_planning_unit_no')
      .eq('source_kind', 'PLANERING')
      .is('voided_at', null)
      .in('source_planning_cell_id', ids);
    if (materializedError) {
      console.error('[garage planning sources] materialized lookup failed', materializedError);
      return NextResponse.json({ error: 'Kunde inte läsa redan hämtade planeringsbilar' }, { status: 500 });
    }
    materialized = (data ?? []) as typeof materialized;
  }

  const byCell = new Map<string, number>();
  for (const row of materialized) byCell.set(row.source_planning_cell_id, (byCell.get(row.source_planning_cell_id) ?? 0) + 1);

  return NextResponse.json({
    status: gate.status,
    ready_at: gate.ready_at,
    can_materialize: gate.status === 'KLAR',
    data: (cells ?? []).map((row) => {
      const materializedCount = byCell.get(row.planning_cell_id) ?? 0;
      return {
        ...row,
        materialized_count: materializedCount,
        remaining_count: Math.max(0, Number(row.ordered_count) - materializedCount),
      };
    }),
  });
}

export async function POST(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  const planningCellId = clean(body.planning_cell_id);
  const direction = clean(body.garage_direction)?.toUpperCase() ?? '';
  const reason = clean(body.planning_reason)?.toUpperCase() ?? '';
  const quantity = Number(body.quantity);
  if (!planningCellId || !DIRECTIONS.has(direction) || !REASONS.has(reason) || !Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: 'planning_cell_id, riktning, orsak och positivt heltalsantal krävs' }, { status: 400 });
  }

  const admin = adminClient();
  const { data: cell, error: cellError } = await admin
    .from('fleet_planning_cells')
    .select('planning_cell_id,period_code,model,station,ordered_count,note')
    .eq('planning_cell_id', planningCellId)
    .maybeSingle();
  if (cellError) {
    console.error('[garage planning sources] source lookup failed', cellError);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsraden' }, { status: 500 });
  }
  if (!cell) return NextResponse.json({ error: 'Planeringsraden finns inte' }, { status: 404 });
  if (!MONTH_RE.test(String(cell.period_code))) return NextResponse.json({ error: 'Endast månadsplanering kan hämtas till Garaget' }, { status: 409 });

  let gate: { status: string; ready_at: string | null };
  try { gate = await periodStatus(admin, String(cell.period_code)); }
  catch (error) {
    console.error('[garage planning sources] period status lookup failed', error);
    return NextResponse.json({ error: 'Kunde inte kontrollera planeringsstatus' }, { status: 500 });
  }
  if (gate.status !== 'KLAR') {
    return NextResponse.json({ error: 'Planeringen är PÅGÅENDE. Markera månaden KLAR innan Garaget får hämta BESTÄLLT.' }, { status: 409 });
  }

  const { data: existing, error: existingError } = await admin
    .from('garage_items')
    .select('source_planning_unit_no')
    .eq('source_kind', 'PLANERING')
    .eq('source_planning_cell_id', planningCellId)
    .is('voided_at', null)
    .order('source_planning_unit_no', { ascending: true });
  if (existingError) {
    console.error('[garage planning sources] existing lookup failed', existingError);
    return NextResponse.json({ error: 'Kunde inte kontrollera redan hämtade bilar' }, { status: 500 });
  }

  const used = new Set((existing ?? []).map((row) => Number(row.source_planning_unit_no)));
  const availableUnits: number[] = [];
  for (let unit = 1; unit <= Number(cell.ordered_count); unit += 1) if (!used.has(unit)) availableUnits.push(unit);
  if (quantity > availableUnits.length) {
    return NextResponse.json({ error: `Endast ${availableUnits.length} återstår att hämta från denna planeringsrad` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const rows = availableUnits.slice(0, quantity).map((unit) => ({
    planning_period: cell.period_code,
    model: cell.model,
    garage_direction: direction,
    planning_reason: reason,
    planned_station: cell.station,
    confirmation_status: 'PLANERAD',
    transport_status: 'EJ_BOKAD',
    source_kind: 'PLANERING',
    source_planning_cell_id: cell.planning_cell_id,
    source_planning_unit_no: unit,
    note: cell.note,
    created_at: now,
    updated_at: now,
    created_by: verification.user.id,
    updated_by: verification.user.id,
  }));

  const { data, error } = await admin.from('garage_items').insert(rows).select('*');
  if (error) {
    console.error('[garage planning sources] insert failed', error);
    return NextResponse.json({ error: 'Kunde inte hämta bilarna till Garaget' }, { status: 500 });
  }

  const events = (data ?? []).map((item) => ({
    garage_item_id: item.garage_item_id,
    from_direction: null,
    to_direction: direction,
    reason: 'Hämtad från Planering',
    changed_at: now,
    changed_by: verification.user.id,
  }));
  if (events.length > 0) {
    const { error: eventError } = await admin.from('garage_direction_events').insert(events);
    if (eventError) console.error('[garage planning sources] direction audit failed after insert', eventError);
  }

  return NextResponse.json({ data: data ?? [] }, { status: 201 });
}
