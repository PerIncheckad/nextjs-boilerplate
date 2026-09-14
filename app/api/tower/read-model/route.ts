import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';

type Health = 'VERIFIED' | 'PARTIAL' | 'BLOCKED' | 'EXTERNAL';
type PrimaryState = 'AVAILABLE' | 'RENTAL' | 'DOWNTIME' | 'PREPARATION' | 'SALU' | 'OTHER' | 'UNKNOWN';
type Row = Record<string, unknown>;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function regnr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/\s+/g, '').trim();
  return normalized || null;
}

function countBy(rows: Row[], key: string): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = typeof row[key] === 'string' && row[key] ? String(row[key]) : 'UNKNOWN';
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export async function GET(request: Request) {
  const verification = await verifyApiUser(request);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('[tower-read-model] Missing server configuration:', error);
    return NextResponse.json({ error: 'Tower read model unavailable' }, { status: 503 });
  }

  try {
    const [
      periodsRes,
      activitiesRes,
      saluRes,
      garageRes,
      planningRes,
      materializedRes,
      rentalRes,
      wheelRes,
      canonicalActiveRes,
      fleetBootstrapRes,
    ] = await Promise.all([
      admin.from('vehicle_journey_periods')
        .select('regnr,period_type,started_at,reason_code,reason_text,source_system,source_entity,source_record_id')
        .is('ended_at', null),
      admin.from('vehicle_journey_activity_periods')
        .select('regnr,activity_type,parent_period_id,started_at,source_system,source_entity')
        .is('ended_at', null),
      admin.from('salu_flags')
        .select('flag_id,regnr,status,escalation_status,owner_function,current_saludatum,created_at')
        .neq('status', 'STÄNGD'),
      admin.from('garage_items')
        .select('garage_item_id,regnr,garage_direction,source_kind,confirmation_status,transport_status,handed_off_at,completed_at,voided_at,planned_station,model,source_planning_cell_id')
        .is('voided_at', null),
      admin.from('fleet_planning_cells')
        .select('planning_cell_id,period_code,station,model,ordered_count')
        .gt('ordered_count', 0),
      admin.from('garage_items')
        .select('source_planning_cell_id')
        .eq('source_kind', 'PLANERING')
        .is('voided_at', null)
        .not('source_planning_cell_id', 'is', null),
      admin.from('rental_operational_facts').select('regnr').limit(1),
      admin.from('garage_wheel_changes')
        .select('wheel_change_id,regnr,status,season_key,booked_for,updated_at'),
      admin.from('fleet_membership_current_by_identity')
        .select('identity_id', { count: 'exact', head: true })
        .eq('membership_state', 'ACTIVE')
        .eq('resolution_reason', 'RESOLVED'),
      admin.from('fleet_membership_bootstrap_batch_status')
        .select('batch_id,t0,scope,coverage_mode,verified,complete_active_population_attested,application_id,bootstrap_denominator_eligible,unresolved_count')
        .eq('scope', 'OWN_FLEET')
        .eq('coverage_mode', 'COMPLETE_ACTIVE_POPULATION')
        .eq('verified', true)
        .eq('complete_active_population_attested', true)
        .eq('bootstrap_denominator_eligible', true)
        .eq('unresolved_count', 0)
        .not('application_id', 'is', null)
        .order('t0', { ascending: false })
        .limit(1),
    ]);

    const responses = [
      periodsRes,
      activitiesRes,
      saluRes,
      garageRes,
      planningRes,
      materializedRes,
      rentalRes,
      wheelRes,
      canonicalActiveRes,
      fleetBootstrapRes,
    ];
    const failed = responses.find((response) => response.error);
    if (failed?.error) throw failed.error;

    const periods = (periodsRes.data ?? []) as Row[];
    const activities = (activitiesRes.data ?? []) as Row[];
    const salu = (saluRes.data ?? []) as Row[];
    const garageAll = (garageRes.data ?? []) as Row[];
    const planning = (planningRes.data ?? []) as Row[];
    const materialized = (materializedRes.data ?? []) as Row[];
    const rentalFactsPresent = (rentalRes.data ?? []).length > 0;
    const wheelChanges = (wheelRes.data ?? []) as Row[];
    const canonicalActiveCount = canonicalActiveRes.count;
    const fleetBootstrap = (fleetBootstrapRes.data ?? [])[0] as Row | undefined;
    const fleetMembershipVerified = canonicalActiveCount != null && Boolean(fleetBootstrap?.application_id);

    const garageOwned = garageAll.filter((row) =>
      row.garage_direction === 'IN'
      && !row.voided_at
      && !row.completed_at
      && !row.handed_off_at,
    );

    const materializedByCell = new Map<string, number>();
    for (const row of materialized) {
      const cellId = typeof row.source_planning_cell_id === 'string' ? row.source_planning_cell_id : null;
      if (cellId) materializedByCell.set(cellId, (materializedByCell.get(cellId) ?? 0) + 1);
    }

    let plannedPurchasesRemaining = 0;
    for (const row of planning) {
      const cellId = typeof row.planning_cell_id === 'string' ? row.planning_cell_id : '';
      const ordered = typeof row.ordered_count === 'number' ? row.ordered_count : 0;
      plannedPurchasesRemaining += Math.max(ordered - (materializedByCell.get(cellId) ?? 0), 0);
    }

    const primaryStateCounts: Record<PrimaryState, number> = {
      AVAILABLE: 0,
      RENTAL: 0,
      DOWNTIME: 0,
      PREPARATION: 0,
      SALU: 0,
      OTHER: 0,
      UNKNOWN: 0,
    };
    const capturedRegnrs = new Set<string>();
    for (const row of periods) {
      const vehicle = regnr(row.regnr);
      if (!vehicle) continue;
      capturedRegnrs.add(vehicle);
      const state = typeof row.period_type === 'string' ? row.period_type : 'OTHER';
      if (state === 'AVAILABLE' || state === 'RENTAL' || state === 'DOWNTIME' || state === 'PREPARATION' || state === 'SALU') {
        primaryStateCounts[state] += 1;
      } else {
        primaryStateCounts.OTHER += 1;
      }
    }

    const workshopCaptured = new Set(
      activities
        .filter((row) => row.activity_type === 'WORKSHOP')
        .map((row) => regnr(row.regnr))
        .filter((value): value is string => Boolean(value)),
    ).size;

    const openWheelChanges = wheelChanges.filter((row) => row.status !== 'KLAR');
    const saluEscalation = countBy(salu, 'escalation_status');

    const sources: Record<string, { health: Health; reason: string }> = {
      fleetMembership: fleetMembershipVerified
        ? {
          health: 'VERIFIED',
          reason: 'ACTIVE OWN_FLEET is read only from fleet_membership_current_by_identity; completeness is backed by an applied COMPLETE_ACTIVE_POPULATION bootstrap.',
        }
        : {
          health: 'BLOCKED',
          reason: 'Canonical ACTIVE OWN_FLEET membership is not currently backed by an applied COMPLETE_ACTIVE_POPULATION bootstrap.',
        },
      primaryOperationalState: {
        health: 'PARTIAL',
        reason: 'Layer 1 is authoritative where present but does not define canonical fleet membership.',
      },
      rental: rentalFactsPresent
        ? { health: 'PARTIAL', reason: 'Rental source has facts; completeness must be verified before fleet-wide RENTAL is promoted.' }
        : { health: 'BLOCKED', reason: 'rental_operational_facts is empty; RENTAL must not be inferred from another source.' },
      salu: {
        health: 'VERIFIED',
        reason: 'Open SALU process is sourced from salu_flags where status is not STÄNGD.',
      },
      garage: {
        health: 'VERIFIED',
        reason: 'Garage ownership is sourced from non-voided inbound garage_items not completed or handed off to Nybil.',
      },
      plannedPurchases: {
        health: 'VERIFIED',
        reason: 'Remaining planned purchases are BESTÄLLT minus non-voided PLANERING materializations.',
      },
      wheelChange: {
        health: 'PARTIAL',
        reason: 'Existing wheel-change process rows are readable, but canonicalCandidateCount remains blocked until the separate Hjulskifte consumer cutover.',
      },
      avveckla: {
        health: 'EXTERNAL',
        reason: 'AVVECKLA read contract is owned by the separate AVVECKLA workstream and is intentionally not redefined here.',
      },
    };

    return NextResponse.json({
      data: {
        generatedAt: new Date().toISOString(),
        contractVersion: 'TOWER_READ_MODEL_V1',
        semantics: {
          purpose: 'OPERATIVE_BUSINESS_COCKPIT',
          rule: 'READ_BROADLY_INTERVENE_THROUGH_OWNER',
          noHeuristicFleetTruth: true,
        },
        fleet: {
          active: fleetMembershipVerified ? canonicalActiveCount : null,
          health: sources.fleetMembership.health,
          capturedPrimaryStateVehicles: capturedRegnrs.size,
          primaryStates: primaryStateCounts,
          workshopCaptured,
        },
        processes: {
          salu: {
            open: salu.length,
            byStatus: countBy(salu, 'status'),
            byEscalation: saluEscalation,
          },
          garage: {
            owned: garageOwned.length,
            byConfirmationStatus: countBy(garageOwned, 'confirmation_status'),
            byTransportStatus: countBy(garageOwned, 'transport_status'),
            withRegnr: garageOwned.filter((row) => regnr(row.regnr)).length,
            withoutRegnr: garageOwned.filter((row) => !regnr(row.regnr)).length,
          },
          plannedPurchases: {
            remaining: plannedPurchasesRemaining,
          },
          wheelChange: {
            openProcessRows: openWheelChanges.length,
            byStatus: countBy(openWheelChanges, 'status'),
            canonicalCandidateCount: null,
          },
          avveckla: {
            count: null,
            health: sources.avveckla.health,
          },
        },
        attention: {
          health: 'PARTIAL' as Health,
          capturedDowntime: primaryStateCounts.DOWNTIME,
          saluT10: saluEscalation.T10 ?? 0,
          saluPassed: saluEscalation.PASSERAD ?? 0,
          note: 'This layer is an overlay, not the Tower master population.',
        },
        sources,
      },
    });
  } catch (error) {
    console.error('[tower-read-model] Read failed:', error);
    return NextResponse.json({ error: 'Could not load Tower read model' }, { status: 500 });
  }
}
