import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiUser } from '@/lib/server-auth';
import { normalizeTowerRegnr, reconcileTowerPopulation } from '@/lib/tower-population-reconciliation';

type Health = 'VERIFIED' | 'PARTIAL' | 'BLOCKED' | 'EXTERNAL';
type Row = Record<string, unknown>;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function countBy(rows: Row[], key: string): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = typeof row[key] === 'string' && row[key] ? String(row[key]) : 'UNKNOWN';
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
      canonicalRegnrAliasesRes,
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
        .select('identity_id')
        .eq('membership_state', 'ACTIVE')
        .eq('resolution_reason', 'RESOLVED'),
      admin.from('fleet_vehicle_identity_aliases')
        .select('identity_id,alias_value')
        .eq('alias_type', 'REGNR'),
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
      canonicalRegnrAliasesRes,
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
    const canonicalActiveRows = (canonicalActiveRes.data ?? []) as Row[];
    const canonicalRegnrAliases = (canonicalRegnrAliasesRes.data ?? []) as Row[];
    const fleetBootstrap = (fleetBootstrapRes.data ?? [])[0] as Row | undefined;
    const fleetMembershipVerified = Boolean(fleetBootstrap?.application_id);

    const population = reconcileTowerPopulation({
      activeMembershipRows: canonicalActiveRows,
      regnrAliasRows: canonicalRegnrAliases,
      openPrimaryPeriods: periods,
      openActivities: activities,
    });

    const garageOwned = garageAll.filter((row) =>
      row.garage_direction === 'IN'
      && !row.voided_at
      && !row.completed_at
      && !row.handed_off_at,
    );

    const garageDrilldown = garageOwned
      .map((row) => ({
        garageItemId: stringValue(row.garage_item_id),
        regnr: normalizeTowerRegnr(row.regnr),
        model: stringValue(row.model),
        plannedStation: stringValue(row.planned_station),
        confirmationStatus: stringValue(row.confirmation_status),
        transportStatus: stringValue(row.transport_status),
        sourceKind: stringValue(row.source_kind),
      }))
      .sort((a, b) => (a.regnr ?? a.garageItemId ?? '').localeCompare(b.regnr ?? b.garageItemId ?? ''));

    const saluDrilldown = salu
      .map((row) => ({
        flagId: stringValue(row.flag_id),
        regnr: normalizeTowerRegnr(row.regnr),
        status: stringValue(row.status),
        escalationStatus: stringValue(row.escalation_status),
        ownerFunction: stringValue(row.owner_function),
        currentSaludatum: stringValue(row.current_saludatum),
        createdAt: stringValue(row.created_at),
      }))
      .sort((a, b) => (a.regnr ?? a.flagId ?? '').localeCompare(b.regnr ?? b.flagId ?? ''));

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
        reason: 'Layer 1 counts are reconciled against canonical ACTIVE identities. Missing operational position is coverage, not a Layer 1 state.',
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
          missingOperationalPositionIsCoverageNotState: true,
        },
        fleet: {
          active: fleetMembershipVerified ? population.active : null,
          health: sources.fleetMembership.health,
          capturedPrimaryStateVehicles: fleetMembershipVerified ? population.positionedActive : 0,
          positionedActive: fleetMembershipVerified ? population.positionedActive : null,
          missingOperationalPosition: fleetMembershipVerified ? population.missingOperationalPosition : null,
          primaryStates: population.primaryStates,
          workshopCaptured: population.workshopCaptured,
          reconciliation: population.reconciliation,
          drilldown: fleetMembershipVerified ? population.populations : {
            active: [],
            positioned: [],
            missingOperationalPosition: [],
            primaryStates: {
              AVAILABLE: [], RENTAL: [], DOWNTIME: [], PREPARATION: [], SALU: [], OTHER: [], UNKNOWN: [],
            },
            externalLayer1: population.populations.externalLayer1,
          },
        },
        processes: {
          salu: {
            open: saluDrilldown.length,
            byStatus: countBy(salu, 'status'),
            byEscalation: saluEscalation,
            drilldown: saluDrilldown,
          },
          garage: {
            owned: garageDrilldown.length,
            byConfirmationStatus: countBy(garageOwned, 'confirmation_status'),
            byTransportStatus: countBy(garageOwned, 'transport_status'),
            withRegnr: garageDrilldown.filter((row) => row.regnr).length,
            withoutRegnr: garageDrilldown.filter((row) => !row.regnr).length,
            drilldown: garageDrilldown,
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
          capturedDowntime: population.primaryStates.DOWNTIME,
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
