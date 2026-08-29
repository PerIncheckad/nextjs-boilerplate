import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATUSES = new Set(['PAGAENDE', 'KLAR']);

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

async function materializePlanningToGarage(
  admin: ReturnType<typeof adminClient>,
  period: string,
  userId: string,
) {
  const { data: cells, error: cellsError } = await admin
    .from('fleet_planning_cells')
    .select('planning_cell_id,period_code,model,model_code,station,ordered_count,note')
    .eq('period_code', period)
    .gt('ordered_count', 0);
  if (cellsError) throw cellsError;
  if (!cells?.length) return 0;

  const cellIds = cells.map((cell) => cell.planning_cell_id);
  const { data: existing, error: existingError } = await admin
    .from('garage_items')
    .select('source_planning_cell_id,source_planning_unit_no')
    .eq('source_kind', 'PLANERING')
    .in('source_planning_cell_id', cellIds);
  if (existingError) throw existingError;

  const usedByCell = new Map<string, Set<number>>();
  for (const row of existing ?? []) {
    if (!row.source_planning_cell_id || !row.source_planning_unit_no) continue;
    const used = usedByCell.get(row.source_planning_cell_id) ?? new Set<number>();
    used.add(Number(row.source_planning_unit_no));
    usedByCell.set(row.source_planning_cell_id, used);
  }

  const modelCodes = [...new Set(cells.map((cell) => cell.model_code).filter(Boolean))] as string[];
  const rateByModelCode = new Map<string, number | null>();
  if (modelCodes.length > 0) {
    const { data: modelRows, error: modelError } = await admin
      .from('planning_vehicle_models')
      .select('model_code,daily_rate')
      .in('model_code', modelCodes);
    if (modelError) throw modelError;
    for (const row of modelRows ?? []) rateByModelCode.set(row.model_code, row.daily_rate === null ? null : Number(row.daily_rate));
  }

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const cell of cells) {
    const used = usedByCell.get(cell.planning_cell_id) ?? new Set<number>();
    for (let unit = 1; unit <= Number(cell.ordered_count); unit += 1) {
      if (used.has(unit)) continue;
      rows.push({
        planning_period: cell.period_code,
        model: cell.model,
        garage_direction: 'IN',
        planning_reason: 'ANNAT',
        planned_station: cell.station,
        daily_rate: cell.model_code ? (rateByModelCode.get(cell.model_code) ?? null) : null,
        confirmation_status: 'PLANERAD',
        transport_status: 'EJ_BOKAD',
        source_kind: 'PLANERING',
        source_planning_cell_id: cell.planning_cell_id,
        source_planning_unit_no: unit,
        note: cell.note,
        created_at: now,
        updated_at: now,
        created_by: userId,
        updated_by: userId,
      });
    }
  }

  if (rows.length === 0) return 0;

  const { data: inserted, error: insertError } = await admin
    .from('garage_items')
    .insert(rows)
    .select('garage_item_id');
  if (insertError) throw insertError;

  const events = (inserted ?? []).map((item) => ({
    garage_item_id: item.garage_item_id,
    from_direction: null,
    to_direction: 'IN',
    reason: 'Planering markerad KLAR',
    changed_at: now,
    changed_by: userId,
  }));
  if (events.length > 0) {
    const { error: eventError } = await admin.from('garage_direction_events').insert(events);
    if (eventError) console.error('[planning period status] garage direction audit failed', eventError);
  }

  return inserted?.length ?? 0;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const period = new URL(request.url).searchParams.get('period')?.trim() ?? '';
  if (!MONTH_RE.test(period)) return NextResponse.json({ error: 'Period måste vara YYYY-MM' }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin.from('planning_period_status')
    .select('period_code,status,ready_at,ready_by,updated_at,updated_by')
    .eq('period_code', period)
    .maybeSingle();

  if (error) {
    console.error('[planning period status] GET failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa planeringsstatus' }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? { period_code: period, status: 'PAGAENDE', ready_at: null, ready_by: null } });
}

export async function PUT(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ogiltig JSON' }, { status: 400 }); }

  const period = clean(body.period_code) ?? '';
  const status = clean(body.status)?.toUpperCase() ?? '';
  if (!MONTH_RE.test(period) || !STATUSES.has(status)) {
    return NextResponse.json({ error: 'period_code YYYY-MM och status PAGAENDE/KLAR krävs' }, { status: 400 });
  }

  const admin = adminClient();
  const now = new Date().toISOString();
  const payload = {
    period_code: period,
    status,
    ready_at: status === 'KLAR' ? now : null,
    ready_by: status === 'KLAR' ? verification.user.id : null,
    updated_at: now,
    updated_by: verification.user.id,
  };

  const { data, error } = await admin.from('planning_period_status')
    .upsert(payload, { onConflict: 'period_code' })
    .select('period_code,status,ready_at,ready_by,updated_at,updated_by')
    .single();

  if (error) {
    console.error('[planning period status] PUT failed', error);
    return NextResponse.json({ error: 'Kunde inte uppdatera planeringsstatus' }, { status: 500 });
  }

  let materialized_count = 0;
  if (status === 'KLAR') {
    try {
      materialized_count = await materializePlanningToGarage(admin, period, verification.user.id);
    } catch (materializeError) {
      console.error('[planning period status] automatic Garage materialization failed', materializeError);
      return NextResponse.json({ error: 'Planeringen markerades KLAR men Garage-objekten kunde inte skapas automatiskt' }, { status: 500 });
    }
  }

  return NextResponse.json({ data, materialized_count });
}
