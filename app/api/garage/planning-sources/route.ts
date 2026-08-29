import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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
