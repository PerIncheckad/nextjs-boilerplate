import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

type HandoffState = 'EJ_STARTAD' | 'VANTAR' | 'PAGAR' | 'VERIFIERAD';

type GarageRow = {
  garage_item_id: string;
  regnr: string | null;
  model: string;
  garage_direction: 'IN' | 'UT' | null;
  planning_reason: string | null;
  source_kind: string;
  source_planning_cell_id: string | null;
  source_planning_unit_no: number | null;
  source_salu_flag_id: string | null;
  source_journey_period_id: string | null;
  source_journey_event_id: string | null;
  source_legacy_entry_id: string | null;
  handed_off_nybil_id: string | null;
  handed_off_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type AvvecklaCase = {
  avveckla_case_id: string;
  garage_item_id: string;
  status: 'OPEN' | 'COMPLETED';
  reason: string;
  started_at: string;
  completed_at: string | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sourceRecord(item: GarageRow): { label: string; record: string } {
  if (item.source_kind === 'PLANERING' && item.source_planning_cell_id) {
    return {
      label: 'Planering',
      record: `${item.source_planning_cell_id}${item.source_planning_unit_no ? ` / enhet ${item.source_planning_unit_no}` : ''}`,
    };
  }
  if (item.source_kind === 'SALU' && item.source_salu_flag_id) {
    return { label: 'SALU', record: item.source_salu_flag_id };
  }
  if (item.source_kind === 'LAGER1' && item.source_legacy_entry_id) {
    return { label: 'LEGACY', record: item.source_legacy_entry_id };
  }
  if (item.source_kind === 'LAGER1' && item.source_journey_period_id) {
    return { label: 'Layer 1', record: item.source_journey_period_id };
  }
  return { label: item.source_kind || 'Garage', record: item.garage_item_id };
}

function whyHere(item: GarageRow): string {
  if (item.source_kind === 'SALU' && item.source_salu_flag_id) return 'SALU beslut SÄLJAS';
  if (item.source_kind === 'LAGER1' && item.source_legacy_entry_id) return 'Verifierat LEGACY_FLEET → Garage UT';
  if (item.source_kind === 'PLANERING') return item.planning_reason ? `Planering · ${item.planning_reason}` : 'Planering → Garage';
  return item.planning_reason ? `Manuell Garage-episod · ${item.planning_reason}` : 'Manuell Garage-episod';
}

function blockersForIn(item: GarageRow): string[] {
  if (item.handed_off_nybil_id) return [];
  const blockers: string[] = [];
  if (!item.regnr?.trim()) blockers.push('Registreringsnummer saknas');
  return blockers;
}

function blockersForUt(item: GarageRow, avvecklaCase: AvvecklaCase | null): string[] {
  if (avvecklaCase) return [];
  const blockers: string[] = [];
  if (!item.regnr?.trim()) blockers.push('Registreringsnummer saknas');
  return blockers;
}

function handoffForIn(item: GarageRow): { state: HandoffState; label: string; verifiedAt: string | null } {
  if (item.handed_off_nybil_id) return { state: 'VERIFIERAD', label: 'MOTTAGEN I NYBIL', verifiedAt: item.handed_off_at };
  if (!item.regnr?.trim()) return { state: 'EJ_STARTAD', label: 'EJ STARTAD', verifiedAt: null };
  return { state: 'VANTAR', label: 'VÄNTAR PÅ NYBIL', verifiedAt: null };
}

function handoffForUt(item: GarageRow, avvecklaCase: AvvecklaCase | null): { state: HandoffState; label: string; verifiedAt: string | null } {
  if (!avvecklaCase) return { state: 'EJ_STARTAD', label: 'AVVECKLA EJ STARTAD', verifiedAt: null };
  if (avvecklaCase.status === 'OPEN') return { state: 'PAGAR', label: 'AVVECKLA PÅGÅR', verifiedAt: avvecklaCase.started_at };
  return { state: 'VERIFIERAD', label: 'AVVECKLA VERIFIERAD', verifiedAt: avvecklaCase.completed_at ?? avvecklaCase.started_at };
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (error) {
    console.error('[garage/core] Missing server configuration', error);
    return NextResponse.json({ error: 'Garage Core är inte tillgängligt' }, { status: 503 });
  }

  try {
    const [garageRes, avvecklaRes] = await Promise.all([
      admin.from('garage_items')
        .select('garage_item_id,regnr,model,garage_direction,planning_reason,source_kind,source_planning_cell_id,source_planning_unit_no,source_salu_flag_id,source_journey_period_id,source_journey_event_id,source_legacy_entry_id,handed_off_nybil_id,handed_off_at,created_at,updated_at,completed_at')
        .is('voided_at', null)
        .is('completed_at', null)
        .order('created_at', { ascending: false }),
      admin.from('garage_avveckla_cases')
        .select('avveckla_case_id,garage_item_id,status,reason,started_at,completed_at'),
    ]);

    if (garageRes.error) throw garageRes.error;
    if (avvecklaRes.error) throw avvecklaRes.error;

    const casesByGarage = new Map<string, AvvecklaCase>();
    for (const row of avvecklaRes.data ?? []) casesByGarage.set(String(row.garage_item_id), row as AvvecklaCase);

    const data = ((garageRes.data ?? []) as GarageRow[]).map((item) => {
      const provenance = sourceRecord(item);
      const avvecklaCase = item.garage_direction === 'UT' ? casesByGarage.get(item.garage_item_id) ?? null : null;
      const handoff = item.garage_direction === 'IN' ? handoffForIn(item) : handoffForUt(item, avvecklaCase);
      const blockers = item.garage_direction === 'IN' ? blockersForIn(item) : blockersForUt(item, avvecklaCase);
      const nextOwner = item.garage_direction === 'IN' ? 'NYBIL' : item.garage_direction === 'UT' ? 'AVVECKLA' : null;
      const moduleHref = item.garage_direction === 'IN'
        ? '/nybil'
        : item.garage_direction === 'UT' && avvecklaCase
          ? `/avveckla?garage_item_id=${encodeURIComponent(item.garage_item_id)}`
          : null;

      return {
        garage_item_id: item.garage_item_id,
        regnr: item.regnr,
        model: item.model,
        direction: item.garage_direction,
        source_kind: item.source_kind,
        source_label: provenance.label,
        source_record: provenance.record,
        source_journey_period_id: item.source_journey_period_id,
        source_journey_event_id: item.source_journey_event_id,
        why_here: whyHere(item),
        established_at: item.created_at,
        staging_status: handoff.state === 'VERIFIERAD' ? 'HANDOFF VERIFIERAT' : 'I GARAGE',
        next_owner: nextOwner,
        handoff_state: handoff.state,
        handoff_label: handoff.label,
        handoff_verified_at: handoff.verifiedAt,
        blockers,
        module_href: moduleHref,
        avveckla_case_id: avvecklaCase?.avveckla_case_id ?? null,
        avveckla_reason: avvecklaCase?.reason ?? null,
      };
    });

    const counts = {
      active: data.length,
      in: data.filter((item) => item.direction === 'IN').length,
      ut: data.filter((item) => item.direction === 'UT').length,
      waiting: data.filter((item) => item.handoff_state === 'VANTAR' || item.handoff_state === 'EJ_STARTAD').length,
      inProgress: data.filter((item) => item.handoff_state === 'PAGAR').length,
      verified: data.filter((item) => item.handoff_state === 'VERIFIERAD').length,
    };

    return NextResponse.json({ data, counts });
  } catch (error) {
    console.error('[garage/core] Read failed', error);
    return NextResponse.json({ error: 'Kunde inte läsa Garage Core' }, { status: 500 });
  }
}
