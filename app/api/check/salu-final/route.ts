import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizedReg(value: string): string {
  return value.toUpperCase().replace(/\s/g, '');
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const url = new URL(request.url);
  const reg = normalizedReg(url.searchParams.get('reg') ?? '');
  if (!reg) return NextResponse.json({ error: 'reg saknas' }, { status: 400 });

  const admin = adminClient();
  const { data: items, error: itemError } = await admin
    .from('garage_items')
    .select('garage_item_id,regnr,source_salu_flag_id,source_kind,garage_direction,planned_station,transport_status,salu_final_timing_at,salu_transport_details,salu_repair_destination,salu_operational_note,voided_at,handed_off_nybil_id,completed_at')
    .eq('source_kind', 'SALU_PLANERING')
    .is('garage_direction', null)
    .is('voided_at', null)
    .is('handed_off_nybil_id', null)
    .is('completed_at', null)
    .eq('regnr', reg);

  if (itemError) return NextResponse.json({ error: 'Kunde inte läsa SISTA HYRAN-underlaget' }, { status: 500 });
  if (!items?.length) return NextResponse.json({ data: null });
  if (items.length !== 1) return NextResponse.json({ error: 'Flera aktiva SALU PLANERING-kedjor finns för bilen. Ingen heuristisk matchning tillåts.' }, { status: 409 });

  const item = items[0];
  if (!item.source_salu_flag_id) return NextResponse.json({ error: 'Exakt SALU-källa saknas' }, { status: 409 });

  const [planResult, decisionResult, finalResult] = await Promise.all([
    admin.from('salu_plans').select('plan_id,flag_id,regnr,source_saludatum,planned_saludatum,proposed_end_date,salu_destination,transport_mode,repair_destination,transport_book_by,note,status,planned_at').eq('flag_id', item.source_salu_flag_id).maybeSingle(),
    admin.from('garage_sista_hyran_current').select('decision_id,garage_item_id,salu_plan_id,source_salu_flag_id,regnr,decision_status,decision_version,last_rental_at,decision_note,decided_at').eq('garage_item_id', item.garage_item_id).maybeSingle(),
    admin.from('garage_sista_incheckning_current').select('sista_incheckning_id,garage_item_id,salu_plan_id,source_salu_flag_id,decision_id,decision_version,checkin_id,regnr,final_checkin_completed_at,checkin_completed_by,checkin_checker_name,checkin_checker_email,verified_at').eq('garage_item_id', item.garage_item_id).maybeSingle(),
  ]);

  if (planResult.error || decisionResult.error || finalResult.error) return NextResponse.json({ error: 'Kunde inte läsa SISTA HYRAN-underlaget' }, { status: 500 });
  const plan = planResult.data;
  const decision = decisionResult.data;
  if (!decision) return NextResponse.json({ data: null });
  if (!plan || plan.plan_id !== decision.salu_plan_id || plan.flag_id !== decision.source_salu_flag_id) return NextResponse.json({ error: 'SISTA HYRAN saknar exakt matchande SALU-plan' }, { status: 409 });

  return NextResponse.json({
    data: {
      garage_item_id: item.garage_item_id,
      regnr: decision.regnr,
      source_plan: plan,
      garage: {
        planned_station: item.planned_station,
        transport_status: item.transport_status,
        salu_final_timing_at: item.salu_final_timing_at,
        salu_transport_details: item.salu_transport_details,
        salu_repair_destination: item.salu_repair_destination,
        salu_operational_note: item.salu_operational_note,
      },
      sista_hyran: decision,
      sista_incheckning: finalResult.data ?? null,
    },
  });
}
