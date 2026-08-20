import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

const REGNR_RE = /^[A-Z]{3}[0-9]{2}[0-9A-Z]$/;
const HOUR_MS = 60 * 60 * 1000;

type QueryError = { message?: string } | null;

function cleanRegnr(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '');
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase server configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function durationHours(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round(((end - start) / HOUR_MS) * 10) / 10;
}

function firstError(errors: Array<[string, QueryError]>): string | null {
  for (const [label, error] of errors) {
    if (error) {
      console.error(`[vehicle-journey] ${label} query failed:`, error);
      return label;
    }
  }
  return null;
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const { searchParams } = new URL(request.url);
  const regnr = cleanRegnr(searchParams.get('reg') ?? searchParams.get('regnr') ?? '');

  if (!REGNR_RE.test(regnr)) {
    return NextResponse.json({ error: 'Invalid regnr' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[vehicle-journey] Missing server configuration:', error);
    return NextResponse.json({ error: 'Vehicle journey unavailable' }, { status: 503 });
  }

  const [
    nybilResponse,
    vehicleResponse,
    checkinResponse,
    damagesResponse,
    eventsResponse,
    periodsResponse,
    documentsResponse,
    receiptsResponse,
    saluStateResponse,
    saluFlagsResponse,
  ] = await Promise.all([
    admin
      .from('nybil_inventering')
      .select([
        'id',
        'regnr',
        'bilmarke',
        'modell',
        'registreringsdatum',
        'matarstallning_inkop',
        'matarstallning_aktuell',
        'plats_mottagning_ort',
        'plats_mottagning_station',
        'plats_aktuell_ort',
        'plats_aktuell_station',
        'hjultyp',
        'hjul_ej_monterade',
        'hjul_forvaring_ort',
        'hjul_forvaring_spec',
        'antal_nycklar',
        'antal_laddkablar',
        'antal_insynsskydd',
        'instruktionsbok',
        'coc',
        'lasbultar_med',
        'dragkrok',
        'gummimattor',
        'dackkompressor',
        'bransletyp',
        'tankstatus',
        'laddniva_procent',
        'har_skador_vid_leverans',
        'photo_urls',
        'video_urls',
        'media_folder',
        'saludatum_planerat',
        'saludatum',
        'is_sold',
        'sold_date',
        'created_at',
        'updated_at',
      ].join(','))
      .eq('regnr', regnr)
      .order('created_at', { ascending: false })
      .limit(1),
    admin
      .from('vehicles')
      .select([
        'regnr',
        'brand',
        'model',
        'is_sold',
        'sold_date',
        'antal_nycklar',
        'antal_laddkablar',
        'antal_insynsskydd',
        'har_kompressor',
        'har_gummimattor',
        'har_vinterdack',
        'har_sommarhjul',
        'hjul_pa_bilen',
        'wheel_storage_location',
        'coc_location',
        'instruktionsbok_location',
        'bransletyp',
        'datum_ankomst_mabi',
        'bilfakta_imported_at',
      ].join(','))
      .eq('regnr', regnr)
      .limit(1),
    admin
      .from('checkins')
      .select([
        'id',
        'status',
        'completed_at',
        'current_city',
        'current_station',
        'current_location_note',
        'odometer_km',
        'hjultyp',
        'fuel_type',
        'fuel_level',
        'charge_level_percent',
        'checklist',
        'photo_urls',
        'checker_name',
        'checker_email',
        'completed_by',
      ].join(','))
      .eq('regnr', regnr)
      .eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false })
      .limit(1),
    admin
      .from('damages')
      .select('id,regnr,source,user_type,damage_type_raw,user_positions,damage_date,created_at,legacy_damage_source_text,uploads')
      .eq('regnr', regnr)
      .in('source', ['CHECK', 'NYBIL', 'BUHS'])
      .order('created_at', { ascending: false }),
    admin
      .from('vehicle_journey_events')
      .select('event_id,event_type,event_key,occurred_at,source_system,source_entity,source_record_id,actor_id,actor_source,actor_name,actor_email,payload,correction_of_event_id')
      .eq('regnr', regnr)
      .order('occurred_at', { ascending: false }),
    admin
      .from('vehicle_journey_periods')
      .select('period_id,period_type,started_at,ended_at,reason_code,reason_text,source_system,source_entity,source_record_id,source_event_id,metadata')
      .eq('regnr', regnr)
      .order('started_at', { ascending: false }),
    admin
      .from('vehicle_documents')
      .select('document_id,document_type,title,storage_bucket,storage_path,external_url,file_name,mime_type,size_bytes,journey_event_id,checkin_id,damage_id,salu_flag_id,salu_checkpoint_id,salu_child_process_id,source_system,source_record_id,metadata,uploaded_by,uploaded_by_name,uploaded_by_email,uploaded_at')
      .eq('regnr', regnr)
      .order('uploaded_at', { ascending: false }),
    admin
      .from('vehicle_receipts')
      .select('id,checkin_id,receipt_type,file_url,file_path,file_name,mime_type,uploaded_by_email,uploaded_by_name,uploaded_at')
      .eq('regnr', regnr)
      .order('uploaded_at', { ascending: false }),
    admin
      .from('salu_vehicle_state')
      .select('regnr,ny_date,original_saludatum,current_saludatum,control_mode,manual_months,auto_rule_id,auto_rule_version,auto_months_applied,final_slutbedomning_at,final_closed_at,stillestand_salu_days,stillestand_cause_code,updated_at')
      .eq('regnr', regnr)
      .limit(1),
    admin
      .from('salu_flags')
      .select('flag_id,previous_flag_id,cycle_saludatum,current_saludatum,status,escalation_status,owner_function,created_at,acknowledged_at,closed_at,closure_outcome,closure_comment')
      .eq('regnr', regnr)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const failedSource = firstError([
    ['nybil', nybilResponse.error],
    ['vehicle', vehicleResponse.error],
    ['checkin', checkinResponse.error],
    ['damages', damagesResponse.error],
    ['journey events', eventsResponse.error],
    ['journey periods', periodsResponse.error],
    ['documents', documentsResponse.error],
    ['legacy receipts', receiptsResponse.error],
    ['SALU state', saluStateResponse.error],
    ['SALU flags', saluFlagsResponse.error],
  ]);

  if (failedSource) {
    return NextResponse.json({ error: `Failed to load ${failedSource}` }, { status: 500 });
  }

  const nybil = nybilResponse.data?.[0] ?? null;
  const vehicle = vehicleResponse.data?.[0] ?? null;
  const latestCheckin = checkinResponse.data?.[0] ?? null;
  const saluState = saluStateResponse.data?.[0] ?? null;
  const latestSaluFlag = saluFlagsResponse.data?.[0] ?? null;

  const [checkpointResponse, childProcessesResponse] = latestSaluFlag
    ? await Promise.all([
        admin
          .from('salu_checkpoints')
          .select('checkpoint_id,checkpoint_code,status,evidence_refs,updated_at')
          .eq('flag_id', latestSaluFlag.flag_id)
          .order('checkpoint_code', { ascending: true }),
        admin
          .from('salu_child_processes')
          .select('child_process_id,process_type,source_checkpoint,source_reason,owner_ref,execution_system,deadline_at,due_event,status,status_timestamp,blocking,blocks_step,outcome,evidence_refs,verified_at,cancel_reason,created_at')
          .eq('flag_id', latestSaluFlag.flag_id)
          .order('created_at', { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const saluFailedSource = firstError([
    ['SALU checkpoints', checkpointResponse.error],
    ['SALU child processes', childProcessesResponse.error],
  ]);
  if (saluFailedSource) {
    return NextResponse.json({ error: `Failed to load ${saluFailedSource}` }, { status: 500 });
  }

  const periods = (periodsResponse.data ?? []).map((period) => ({
    ...period,
    durationHours: durationHours(period.started_at, period.ended_at),
  }));

  const periodHours = periods.reduce<Record<string, number>>((totals, period) => {
    if (period.durationHours !== null) {
      totals[period.period_type] = Math.round(((totals[period.period_type] ?? 0) + period.durationHours) * 10) / 10;
    }
    return totals;
  }, {});

  const equipmentBaseline = nybil
    ? {
        keys: nybil.antal_nycklar,
        chargingCables: nybil.antal_laddkablar,
        privacyCovers: nybil.antal_insynsskydd,
        instructionBook: nybil.instruktionsbok,
        coc: nybil.coc,
        wheelLocks: nybil.lasbultar_med,
        towbar: nybil.dragkrok,
        rubberMats: nybil.gummimattor,
        tireCompressor: nybil.dackkompressor,
        mountedWheels: nybil.hjultyp,
        looseWheels: nybil.hjul_ej_monterade,
      }
    : null;

  const equipmentCurrent = vehicle
    ? {
        keys: vehicle.antal_nycklar,
        chargingCables: vehicle.antal_laddkablar,
        privacyCovers: vehicle.antal_insynsskydd,
        instructionBookLocation: vehicle.instruktionsbok_location,
        cocLocation: vehicle.coc_location,
        rubberMats: vehicle.har_gummimattor,
        tireCompressor: vehicle.har_kompressor,
        mountedWheels: vehicle.hjul_pa_bilen,
        hasWinterWheels: vehicle.har_vinterdack,
        hasSummerWheels: vehicle.har_sommarhjul,
      }
    : null;

  const documents = [
    ...(documentsResponse.data ?? []).map((document) => ({
      ...document,
      sourceKind: 'vehicle_document' as const,
    })),
    ...(receiptsResponse.data ?? []).map((receipt) => ({
      document_id: `legacy-receipt:${receipt.id}`,
      document_type: receipt.receipt_type,
      title: receipt.file_name,
      storage_bucket: 'receipts',
      storage_path: receipt.file_path,
      external_url: receipt.file_url,
      file_name: receipt.file_name,
      mime_type: receipt.mime_type,
      size_bytes: null,
      journey_event_id: null,
      checkin_id: receipt.checkin_id,
      damage_id: null,
      salu_flag_id: null,
      salu_checkpoint_id: null,
      salu_child_process_id: null,
      source_system: 'LEGACY_RECEIPTS',
      source_record_id: String(receipt.id),
      metadata: {},
      uploaded_by: null,
      uploaded_by_name: receipt.uploaded_by_name,
      uploaded_by_email: receipt.uploaded_by_email,
      uploaded_at: receipt.uploaded_at,
      sourceKind: 'legacy_receipt' as const,
    })),
  ].sort((left, right) => new Date(right.uploaded_at).getTime() - new Date(left.uploaded_at).getTime());

  const found = Boolean(
    nybil ||
      vehicle ||
      latestCheckin ||
      (damagesResponse.data?.length ?? 0) > 0 ||
      (eventsResponse.data?.length ?? 0) > 0 ||
      periods.length > 0 ||
      documents.length > 0 ||
      saluState ||
      latestSaluFlag,
  );

  return NextResponse.json({
    data: {
      found,
      regnr,
      identity: {
        brand: nybil?.bilmarke ?? vehicle?.brand ?? null,
        model: nybil?.modell ?? vehicle?.model ?? null,
      },
      baseline: nybil,
      current: {
        vehicle,
        latestCheckin,
        equipment: equipmentCurrent,
      },
      equipment: {
        baseline: equipmentBaseline,
        current: equipmentCurrent,
      },
      damages: damagesResponse.data ?? [],
      journey: {
        events: eventsResponse.data ?? [],
        periods,
        openPeriods: periods.filter((period) => period.ended_at === null),
        totalHoursByType: periodHours,
      },
      documents,
      salu: {
        state: saluState,
        latestFlag: latestSaluFlag,
        checkpoints: checkpointResponse.data ?? [],
        childProcesses: childProcessesResponse.data ?? [],
      },
    },
  });
}
