import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = adminClient();
  const { data: finals, error: finalError } = await admin
    .from('garage_sista_incheckning_current')
    .select('sista_incheckning_id,garage_item_id,salu_plan_id,source_salu_flag_id,decision_id,decision_version,checkin_id,regnr,final_checkin_completed_at,checkin_completed_by,checkin_checker_name,checkin_checker_email,verified_at')
    .order('final_checkin_completed_at', { ascending: false });

  if (finalError) {
    console.error('[garage-sista-incheckning] final read failed', finalError);
    return NextResponse.json({ error: 'Kunde inte läsa SISTA INCHECKNING' }, { status: 500 });
  }

  const rows = finals ?? [];
  const itemIds = rows.map((row) => row.garage_item_id);
  const checkinIds = rows.map((row) => row.checkin_id);

  const [itemsResult, checkinResult, conflictsResult] = await Promise.all([
    itemIds.length
      ? admin.from('garage_items').select('garage_item_id,planned_station,transport_status,salu_final_timing_at,salu_transport_details,salu_repair_destination,salu_operational_note,completed_at,voided_at').in('garage_item_id', itemIds)
      : Promise.resolve({ data: [], error: null }),
    checkinIds.length
      ? admin.from('checkins').select('id,status,completed_at,current_city,current_station,current_location_note,has_new_damages,checklist').in('id', checkinIds)
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? admin.from('garage_sista_incheckning_conflicts').select('conflict_id,garage_item_id,conflicting_checkin_id,checkin_completed_at,conflict_reason,detected_at').in('garage_item_id', itemIds).order('detected_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (itemsResult.error || checkinResult.error || conflictsResult.error) {
    console.error('[garage-sista-incheckning] source read failed', itemsResult.error || checkinResult.error || conflictsResult.error);
    return NextResponse.json({ error: 'Kunde inte läsa Check-in-underlaget' }, { status: 500 });
  }

  const itemById = new Map((itemsResult.data ?? []).map((row) => [row.garage_item_id, row]));
  const checkinById = new Map((checkinResult.data ?? []).map((row) => [row.id, row]));
  const conflictsByItem = new Map<string, typeof conflictsResult.data>();
  for (const conflict of conflictsResult.data ?? []) {
    const bucket = conflictsByItem.get(conflict.garage_item_id) ?? [];
    bucket.push(conflict);
    conflictsByItem.set(conflict.garage_item_id, bucket);
  }

  return NextResponse.json({
    data: rows.map((row) => ({
      ...row,
      garage: itemById.get(row.garage_item_id) ?? null,
      checkin: checkinById.get(row.checkin_id) ?? null,
      conflicts: conflictsByItem.get(row.garage_item_id) ?? [],
    })),
  });
}
